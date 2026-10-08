/**
 * POST /api/coach — stateless Claude proxy for the FORMA AI coach (Vercel Node function).
 *
 * The browser runs the tool loop: it posts `{ system, messages, tools }`, this function
 * calls the Messages API (beta endpoint, server-side refusal fallback enabled) with the
 * server-side key and forwards the raw stream events as SSE (`event: <type>` /
 * `data: <json>`). Tools are client tools; nothing is stored here.
 *
 * GET /api/coach — health check `{ ok, model, configured }` (no tokens spent).
 *
 * Env: ANTHROPIC_API_KEY (required), ALLOWED_ORIGIN (optional, comma-separated list of
 * origins allowed to call the proxy cross-origin, e.g. https://user.github.io; `*` = any).
 */
import Anthropic from '@anthropic-ai/sdk'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Params accepted by `client.beta.messages.stream` (the SDK's BetaMessageStreamParams). */
export type BetaStreamParams = Parameters<Anthropic['beta']['messages']['stream']>[0]

export const MODEL = 'claude-opus-5-5'
export const MAX_TOKENS = 4000
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000
const MAX_SYSTEM_CHARS = 30_000
const MAX_MESSAGES = 80
const MAX_TOOLS = 40
const MAX_BODY_CHARS = 4_000_000
/** Server-side refusal fallback (scalar "default" form routes by refusal category). */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
// `fallback` blocks are echoed back verbatim from prior responses (audit marker of a fallback hop).
const ALLOWED_BLOCKS = new Set(['text', 'image', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking', 'fallback'])

/* --------------------------------- Helpers -------------------------------- */

/** Sliding-window limiter kept in function memory (per warm instance — best effort). */
export function createRateLimiter(limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS, now: () => number = Date.now) {
  const hits = new Map<string, number[]>()
  return (key: string): { ok: boolean; retryAfterSec: number } => {
    const t = now()
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs)
    if (recent.length >= limit) {
      hits.set(key, recent)
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (t - recent[0])) / 1000)) }
    }
    recent.push(t)
    hits.set(key, recent)
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k)
    }
    return { ok: true, retryAfterSec: 0 }
  }
}

export function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
  const real = req.headers['x-real-ip']
  return first || (Array.isArray(real) ? real[0] : real) || req.socket?.remoteAddress || 'unknown'
}

/**
 * Origin policy: requests without `Origin` (same-origin GET, server tools) pass; with
 * ALLOWED_ORIGIN set the origin must be listed (or `*`); otherwise only same-host origins.
 */
export function checkOrigin(origin: string | undefined, host: string | undefined, allowedEnv: string | undefined) {
  if (!origin) return { allowed: true as const, cors: undefined }
  const list = (allowedEnv ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  let sameHost = false
  try {
    sameHost = !!host && new URL(origin).host === host
  } catch {
    return { allowed: false as const, cors: undefined }
  }
  const allowed = sameHost || list.includes('*') || list.includes(origin.replace(/\/+$/, ''))
  return { allowed, cors: allowed ? origin : undefined }
}

export interface CoachRequestBody {
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  tools: Anthropic.Beta.BetaTool[]
}

type Validation = { ok: true; value: CoachRequestBody } | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Validates and sanitises the browser payload (only known fields and block types pass). */
export function validateBody(raw: unknown): Validation {
  let body = raw
  if (typeof body === 'string') {
    if (body.length > MAX_BODY_CHARS) return { ok: false, error: 'Request too large' }
    try {
      body = JSON.parse(body)
    } catch {
      return { ok: false, error: 'Invalid JSON' }
    }
  }
  if (!isObj(body)) return { ok: false, error: 'Body must be a JSON object' }
  const { system, messages, tools } = body
  if (typeof system !== 'string' || system.length > MAX_SYSTEM_CHARS) return { ok: false, error: 'Invalid system' }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES)
    return { ok: false, error: 'Invalid messages' }
  for (const m of messages) {
    if (!isObj(m) || (m.role !== 'user' && m.role !== 'assistant')) return { ok: false, error: 'Invalid message role' }
    if (typeof m.content === 'string') continue
    if (!Array.isArray(m.content) || m.content.length === 0) return { ok: false, error: 'Invalid message content' }
    for (const b of m.content) {
      if (!isObj(b) || typeof b.type !== 'string' || !ALLOWED_BLOCKS.has(b.type))
        return { ok: false, error: 'Unsupported content block' }
    }
  }
  if (messages[0].role !== 'user') return { ok: false, error: 'First message must be from the user' }
  if (messages[messages.length - 1].role !== 'user') return { ok: false, error: 'Last message must be from the user' }
  if (JSON.stringify(messages).length > MAX_BODY_CHARS) return { ok: false, error: 'Request too large' }

  const cleanTools: Anthropic.Beta.BetaTool[] = []
  if (tools !== undefined) {
    if (!Array.isArray(tools) || tools.length > MAX_TOOLS) return { ok: false, error: 'Invalid tools' }
    for (const t of tools) {
      if (!isObj(t) || typeof t.name !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(t.name))
        return { ok: false, error: 'Invalid tool name' }
      if (!isObj(t.input_schema) || t.input_schema.type !== 'object') return { ok: false, error: 'Invalid tool schema' }
      cleanTools.push({
        name: t.name,
        description: typeof t.description === 'string' ? t.description.slice(0, 4000) : '',
        input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
      })
    }
  }
  return { ok: true, value: { system, messages: messages as Anthropic.Beta.BetaMessageParam[], tools: cleanTools } }
}

/**
 * Builds the Messages API request (model, thinking and effort are fixed server-side).
 * Uses the beta endpoint for the server-side refusal fallback: on a policy decline the
 * API re-runs the request on a fallback model inside the same stream.
 */
export function buildParams(body: CoachRequestBody): BetaStreamParams {
  return {
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    // Breakpoint on the system block caches tools + system across the tool loop.
    system: [{ type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }],
    messages: body.messages,
    ...(body.tools.length ? { tools: body.tools, tool_choice: { type: 'auto' as const } } : {}),
  }
}

/** HTTP status + short message for an SDK error (most specific first). */
export function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: 'Anthropic rate limit reached' }
  if (err instanceof Anthropic.AuthenticationError) return { status: 401, message: 'Invalid ANTHROPIC_API_KEY' }
  if (err instanceof Anthropic.PermissionDeniedError) return { status: 502, message: 'Anthropic denied access for this key' }
  if (err instanceof Anthropic.BadRequestError) return { status: 400, message: err.message }
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: 'Cannot reach the Anthropic API' }
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === 'number' ? err.status : 502
    return { status: status === 403 ? 502 : status, message: err.message }
  }
  return { status: 500, message: 'Proxy error' }
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

/* --------------------------------- Handler -------------------------------- */

type StreamFn = (
  params: BetaStreamParams,
  opts: { signal: AbortSignal },
) => AsyncIterable<Anthropic.Beta.BetaRawMessageStreamEvent>

export interface HandlerDeps {
  env?: Record<string, string | undefined>
  /** Injected in tests; defaults to `client.beta.messages.stream` */
  stream?: StreamFn
  limiter?: (key: string) => { ok: boolean; retryAfterSec: number }
}

export function createCoachHandler(deps: HandlerDeps = {}) {
  const env = deps.env ?? process.env
  const limiter = deps.limiter ?? createRateLimiter()
  let client: Anthropic | undefined
  const stream: StreamFn =
    deps.stream ??
    ((params, opts) => {
      client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 })
      return client.beta.messages.stream(params, { signal: opts.signal })
    })

  return async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
    const { allowed, cors } = checkOrigin(origin, req.headers.host, env.ALLOWED_ORIGIN)
    if (cors) {
      res.setHeader('Access-Control-Allow-Origin', cors)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Max-Age', '86400')
    }
    if (!allowed) return sendJson(res, 403, { error: { message: 'Origin not allowed' } })
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      return res.end()
    }
    if (req.method === 'GET') {
      return sendJson(res, 200, { ok: true, model: MODEL, configured: Boolean(env.ANTHROPIC_API_KEY) })
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS')
      return sendJson(res, 405, { error: { message: 'Method not allowed' } })
    }

    const rate = limiter(clientIp(req))
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.retryAfterSec))
      return sendJson(res, 429, { error: { message: 'Слишком много запросов: не больше 20 в минуту.' } })
    }
    if (!env.ANTHROPIC_API_KEY) {
      return sendJson(res, 500, { error: { message: 'На сервере не задан ANTHROPIC_API_KEY.' } })
    }
    const parsed = validateBody(req.body)
    if (!parsed.ok) return sendJson(res, 400, { error: { message: parsed.error } })

    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })

    let started = false
    const start = () => {
      if (started) return
      started = true
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders?.()
    }

    try {
      for await (const event of stream(buildParams(parsed.value), { signal: controller.signal })) {
        start()
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      }
      start()
      res.end()
    } catch (err) {
      if (controller.signal.aborted) {
        if (!res.writableEnded) res.end()
        return
      }
      const { status, message } = describeError(err)
      if (!started) return sendJson(res, status, { error: { message } })
      res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'api_error', status, message } })}\n\n`)
      res.end()
    }
  }
}

export default createCoachHandler()
