import { describe, expect, it, vi } from 'vitest'
import type { CoachTool } from '../../coach/tools'
import { streamFromChunks } from './sse'
import {
  createGeminiProvider,
  geminiErrorMessage,
  readGeminiStream,
  toGeminiContents,
  toGeminiSchema,
  toGeminiTools,
} from './gemini'
import type { ChatEvent } from './types'

async function collect(it: AsyncIterable<ChatEvent>) {
  const out: ChatEvent[] = []
  for await (const e of it) out.push(e)
  return out
}

const sse = (...objs: unknown[]) => objs.map((o) => `data: ${JSON.stringify(o)}\r\n\r\n`)

const tool = (name: string, schema: Record<string, unknown> = {}, mutates = false): CoachTool => ({
  name,
  description: `${name} description`,
  inputSchema: schema,
  mutates,
  run: async () => ({}),
})

describe('gemini adapter', () => {
  it('streams text deltas, function calls and keeps thought signatures for replay', async () => {
    const chunks = sse(
      { candidates: [{ content: { role: 'model', parts: [{ text: 'Смотрю ' }] } }] },
      { candidates: [{ content: { role: 'model', parts: [{ text: 'данные' }] } }] },
      {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ functionCall: { name: 'get_recent_workouts', args: { days: 7 } }, thoughtSignature: 'sig1' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 },
      },
    )
    // Split one event across chunks to exercise the parser.
    const joined = chunks.join('')
    const events = await collect(readGeminiStream(streamFromChunks([joined.slice(0, 50), joined.slice(50)])))

    expect(events.filter((e) => e.type === 'text_delta').map((e) => (e as { text: string }).text).join('')).toBe(
      'Смотрю данные',
    )
    const call = events.find((e) => e.type === 'tool_call')
    expect(call).toMatchObject({ name: 'get_recent_workouts', input: { days: 7 } })
    const done = events.at(-1)
    expect(done).toMatchObject({ type: 'done', stopReason: 'tool_use', usage: { inputTokens: 120, outputTokens: 30 } })
    const raw = (done as Extract<ChatEvent, { type: 'done' }>).raw
    expect(raw?.provider).toBe('gemini')
    expect(raw?.content).toEqual([
      { text: 'Смотрю данные' },
      { functionCall: { name: 'get_recent_workouts', args: { days: 7 } }, thoughtSignature: 'sig1' },
    ])
  })

  it('maps MAX_TOKENS and safety blocks', async () => {
    const max = await collect(
      readGeminiStream(streamFromChunks(sse({ candidates: [{ content: { parts: [{ text: 'a' }] }, finishReason: 'MAX_TOKENS' }] }))),
    )
    expect(max.at(-1)).toMatchObject({ type: 'done', stopReason: 'max_tokens' })
    const blocked = await collect(readGeminiStream(streamFromChunks(sse({ promptFeedback: { blockReason: 'SAFETY' } }))))
    expect(blocked.at(-1)).toMatchObject({ type: 'done', stopReason: 'refusal' })
  })

  it('converts turns: tool results become functionResponse parts, images inlineData, raw replayed', () => {
    const contents = toGeminiContents([
      { role: 'assistant', parts: [{ type: 'text', text: 'leading assistant turn is dropped' }] },
      {
        role: 'user',
        parts: [
          { type: 'image', mimeType: 'image/jpeg', data: 'AAAA' },
          { type: 'text', text: 'Что на фото?' },
        ],
      },
      {
        role: 'assistant',
        parts: [{ type: 'tool_call', id: 'x', name: 'get_profile_and_targets', input: {} }],
        raw: { provider: 'gemini', content: [{ functionCall: { name: 'get_profile_and_targets', args: {} }, thoughtSignature: 's' }] },
      },
      { role: 'user', parts: [{ type: 'tool_result', id: 'x', name: 'get_profile_and_targets', output: [1, 2] }] },
    ])
    expect(contents).toEqual([
      { role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }, { text: 'Что на фото?' }] },
      { role: 'model', parts: [{ functionCall: { name: 'get_profile_and_targets', args: {} }, thoughtSignature: 's' }] },
      {
        role: 'user',
        parts: [{ functionResponse: { name: 'get_profile_and_targets', response: { result: [1, 2] } } }],
      },
    ])
  })

  it('sanitises JSON Schema for function declarations', () => {
    expect(
      toGeminiSchema({
        type: 'object',
        additionalProperties: false,
        properties: { days: { type: ['integer', 'null'], default: 7, description: 'd' } },
        required: ['days'],
      }),
    ).toEqual({
      type: 'object',
      properties: { days: { type: 'integer', nullable: true, description: 'd', format: 'int32' } },
      required: ['days'],
    })
    const [decl] = toGeminiTools([tool('get_habits_status', { type: 'object', properties: {} })])!
    expect(decl.functionDeclarations[0]).toEqual({ name: 'get_habits_status', description: 'get_habits_status description' })
  })

  it('posts to streamGenerateContent with system instruction and tools', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(streamFromChunks(sse({ candidates: [{ content: { parts: [{ text: 'Привет' }] }, finishReason: 'STOP' }] })), {
        status: 200,
      }),
    )
    const p = createGeminiProvider({ apiKey: 'KEY', model: 'gemini-2.5-flash', fetchImpl: fetchImpl as unknown as typeof fetch })
    const events = await collect(
      p.chat({
        system: 'SYS',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
        tools: [tool('get_weight_trend', { type: 'object', properties: { days: { type: 'integer' } } })],
      }),
    )
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'end_turn' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=KEY',
    )
    const body = JSON.parse(String(init.body))
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'SYS' }] })
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }])
    expect(body.tools[0].functionDeclarations[0].name).toBe('get_weight_trend')
  })

  it('turns 429 and bad-key 400 into clear Russian errors', async () => {
    const fetch429 = async () =>
      new Response(JSON.stringify({ error: { code: 429, message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' } }), {
        status: 429,
      })
    const p = createGeminiProvider({ apiKey: 'k', fetchImpl: fetch429 as unknown as typeof fetch })
    const [ev] = await collect(p.chat({ system: '', messages: [{ role: 'user', parts: [{ type: 'text', text: 'x' }] }], tools: [] }))
    expect(ev).toMatchObject({ type: 'error' })
    expect((ev as { message: string }).message).toMatch(/Лимит бесплатного тарифа/)
    expect(geminiErrorMessage(400, 'API key not valid. Please pass a valid API key.')).toMatch(/Ключ Gemini недействителен/)
    expect(geminiErrorMessage(403, 'forbidden')).toMatch(/ключ/)
  })
})
