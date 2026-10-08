// @vitest-environment node
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import {
  FALLBACK_BETA,
  MODEL,
  type BetaStreamParams,
  buildParams,
  checkOrigin,
  createCoachHandler,
  createRateLimiter,
  describeError,
  validateBody,
} from './coach.js'

class FakeRes extends EventEmitter {
  statusCode = 200
  headers: Record<string, string> = {}
  body = ''
  writableEnded = false
  setHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = v
  }
  flushHeaders() {}
  write(chunk: string) {
    this.body += chunk
    return true
  }
  end(chunk?: string) {
    if (chunk) this.body += chunk
    this.writableEnded = true
  }
}

function fakeReq(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return { method, body, headers: { host: 'forma.vercel.app', ...headers }, socket: { remoteAddress: '1.2.3.4' } } as unknown as IncomingMessage & {
    body?: unknown
  }
}

const goodBody = {
  system: 'Ты тренер',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Привет' }] }],
  tools: [{ name: 'get_profile_and_targets', description: 'Profile', input_schema: { type: 'object', properties: {} }, extra: 1 }],
}

describe('api/coach helpers', () => {
  it('validates and sanitises the payload', () => {
    const ok = validateBody(JSON.stringify(goodBody))
    expect(ok.ok && ok.value.tools[0]).toEqual({
      name: 'get_profile_and_targets',
      description: 'Profile',
      input_schema: { type: 'object', properties: {} },
    })
    const echoed = validateBody({
      ...goodBody,
      messages: [
        goodBody.messages[0],
        { role: 'assistant', content: [{ type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } }, { type: 'text', text: 'ok' }] },
        { role: 'user', content: 'ещё' },
      ],
    })
    expect(echoed.ok).toBe(true)
    expect(validateBody({ ...goodBody, messages: [] }).ok).toBe(false)
    expect(validateBody({ ...goodBody, messages: [{ role: 'assistant', content: 'prefill' }] }).ok).toBe(false)
    expect(
      validateBody({ ...goodBody, messages: [{ role: 'user', content: [{ type: 'document', source: {} }] }] }).ok,
    ).toBe(false)
    expect(validateBody({ ...goodBody, tools: [{ name: 'bad name!', input_schema: { type: 'object' } }] }).ok).toBe(false)
  })

  it('builds Opus 5.5 params: refusal fallback, adaptive thinking, medium effort, cached system, auto tools', () => {
    const v = validateBody(goodBody)
    if (!v.ok) throw new Error(v.error)
    const p = buildParams(v.value)
    expect(FALLBACK_BETA).toBe('server-side-fallback-2026-07-01')
    expect(p).toMatchObject({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: 'Ты тренер', cache_control: { type: 'ephemeral' } }],
      tool_choice: { type: 'auto' },
    })
  })

  it('applies the origin policy', () => {
    expect(checkOrigin(undefined, 'a.app', undefined).allowed).toBe(true)
    expect(checkOrigin('https://a.app', 'a.app', undefined)).toEqual({ allowed: true, cors: 'https://a.app' })
    expect(checkOrigin('https://evil.com', 'a.app', undefined).allowed).toBe(false)
    expect(checkOrigin('https://me.github.io', 'a.app', 'https://me.github.io/, https://x.dev').allowed).toBe(true)
    expect(checkOrigin('https://any.dev', 'a.app', '*').allowed).toBe(true)
  })

  it('limits to 20 requests per minute per key', () => {
    let t = 0
    const limit = createRateLimiter(20, 60_000, () => t)
    for (let i = 0; i < 20; i++) expect(limit('ip').ok).toBe(true)
    expect(limit('ip')).toEqual({ ok: false, retryAfterSec: 60 })
    expect(limit('other').ok).toBe(true)
    t = 60_001
    expect(limit('ip').ok).toBe(true)
  })

  it('maps typed SDK errors', () => {
    const rate = new Anthropic.RateLimitError(429, { type: 'error' }, 'rate', new Headers())
    expect(describeError(rate).status).toBe(429)
    const auth = new Anthropic.AuthenticationError(401, { type: 'error' }, 'auth', new Headers())
    expect(describeError(auth).status).toBe(401)
    expect(describeError(new Error('x'))).toEqual({ status: 500, message: 'Proxy error' })
  })
})

describe('api/coach handler', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-test' }

  it('answers the health check', async () => {
    const res = new FakeRes()
    await createCoachHandler({ env })(fakeReq('GET'), res as unknown as ServerResponse)
    expect(JSON.parse(res.body)).toEqual({ ok: true, model: MODEL, configured: true })
  })

  it('forwards Messages API stream events as SSE', async () => {
    let seen: BetaStreamParams | undefined
    const handler = createCoachHandler({
      env,
      stream: (params) => {
        seen = params
        return (async function* () {
          yield { type: 'message_start', message: { id: 'm' } } as unknown as Anthropic.Beta.BetaRawMessageStreamEvent
          yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Привет' } } as unknown as Anthropic.Beta.BetaRawMessageStreamEvent
          yield { type: 'message_stop' } as unknown as Anthropic.Beta.BetaRawMessageStreamEvent
        })()
      },
    })
    const res = new FakeRes()
    await handler(fakeReq('POST', goodBody, { origin: 'https://forma.vercel.app' }), res as unknown as ServerResponse)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch('text/event-stream')
    expect(res.headers['access-control-allow-origin']).toBe('https://forma.vercel.app')
    expect(res.body).toContain('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Привет"}}\n\n')
    expect(res.writableEnded).toBe(true)
    expect(seen).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: [FALLBACK_BETA] })
  })

  it('returns JSON errors before streaming starts and rejects foreign origins', async () => {
    const handler = createCoachHandler({
      env,
      stream: () =>
        (async function* () {
          throw new Anthropic.RateLimitError(429, { type: 'error' }, 'rate', new Headers())
        })(),
    })
    const res = new FakeRes()
    await handler(fakeReq('POST', goodBody), res as unknown as ServerResponse)
    expect(res.statusCode).toBe(429)

    const foreign = new FakeRes()
    await handler(fakeReq('POST', goodBody, { origin: 'https://evil.com' }), foreign as unknown as ServerResponse)
    expect(foreign.statusCode).toBe(403)

    const noKey = new FakeRes()
    await createCoachHandler({ env: {} })(fakeReq('POST', goodBody), noKey as unknown as ServerResponse)
    expect(noKey.statusCode).toBe(500)
    expect(noKey.body).toContain('ANTHROPIC_API_KEY')
  })
})
