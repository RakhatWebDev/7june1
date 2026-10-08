import { describe, expect, it, vi } from 'vitest'
import { streamFromChunks } from './sse'
import { claudeErrorMessage, createClaudeProvider, readClaudeStream, toClaudeMessages, toClaudeTools } from './claude'
import type { ChatEvent } from './types'

async function collect(it: AsyncIterable<ChatEvent>) {
  const out: ChatEvent[] = []
  for await (const e of it) out.push(e)
  return out
}

/** Messages API SSE as forwarded by api/coach.ts */
const ev = (o: { type: string } & Record<string, unknown>) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`

const TOOL_TURN = [
  ev({
    type: 'message_start',
    message: { id: 'msg_1', type: 'message', role: 'assistant', content: [], model: 'claude-opus-5-5', stop_reason: null, usage: { input_tokens: 900, output_tokens: 1, cache_read_input_tokens: 600 } },
  }),
  ev({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }),
  ev({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG' } }),
  ev({ type: 'content_block_stop', index: 0 }),
  ev({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
  ev({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Смотрю ' } }),
  ev({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'сон.' } }),
  ev({ type: 'content_block_stop', index: 1 }),
  ev({ type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_sleep_summary', input: {} } }),
  ev({ type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"da' } }),
  ev({ type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: 'ys": 3}' } }),
  ev({ type: 'content_block_stop', index: 2 }),
  ev({ type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 42 } }),
  ev({ type: 'message_stop' }),
]

describe('claude adapter', () => {
  it('parses a tool_use turn: text deltas, complete tool input, thinking signature kept for replay', async () => {
    const all = TOOL_TURN.join('')
    const events = await collect(readClaudeStream(streamFromChunks([all.slice(0, 333), all.slice(333, 900), all.slice(900)])))
    expect(events.filter((e) => e.type === 'text_delta').map((e) => (e as { text: string }).text)).toEqual(['Смотрю ', 'сон.'])
    expect(events.find((e) => e.type === 'tool_call')).toEqual({
      type: 'tool_call',
      id: 'toolu_1',
      name: 'get_sleep_summary',
      input: { days: 3 },
    })
    const done = events.at(-1) as Extract<ChatEvent, { type: 'done' }>
    expect(done).toMatchObject({ type: 'done', stopReason: 'tool_use', usage: { inputTokens: 900, outputTokens: 42, cacheReadTokens: 600 } })
    expect(done.raw).toEqual({
      provider: 'claude',
      content: [
        { type: 'thinking', thinking: '', signature: 'SIG' },
        { type: 'text', text: 'Смотрю сон.' },
        { type: 'tool_use', id: 'toolu_1', name: 'get_sleep_summary', input: { days: 3 } },
      ],
    })
  })

  it('does not emit tool calls when the turn was cut by max_tokens', async () => {
    const cut = TOOL_TURN.slice(0, 11).concat(
      ev({ type: 'content_block_stop', index: 2 }),
      ev({ type: 'message_delta', delta: { stop_reason: 'max_tokens', stop_sequence: null }, usage: { output_tokens: 4000 } }),
    )
    const events = await collect(readClaudeStream(streamFromChunks(cut)))
    expect(events.some((e) => e.type === 'tool_call')).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'max_tokens' })
  })

  it('handles a server-side fallback: ignores the marker, runs only post-boundary tools, echoes per API rules', async () => {
    const FB = { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' }, trigger: { type: 'refusal', category: 'cyber' } }
    const stream = [
      ev({ type: 'message_start', message: { id: 'm', model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 1 } } }),
      ev({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }),
      ev({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'DECLINED' } }),
      ev({ type: 'content_block_stop', index: 0 }),
      ev({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
      ev({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Смотрю ' } }),
      ev({ type: 'content_block_stop', index: 1 }),
      ev({ type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_old', name: 'get_sleep_summary', input: {} } }),
      ev({ type: 'content_block_stop', index: 2 }),
      ev({ type: 'content_block_start', index: 3, content_block: FB }),
      ev({ type: 'content_block_stop', index: 3 }),
      ev({ type: 'content_block_start', index: 4, content_block: { type: 'text', text: '' } }),
      ev({ type: 'content_block_delta', index: 4, delta: { type: 'text_delta', text: 'данные.' } }),
      ev({ type: 'content_block_stop', index: 4 }),
      ev({ type: 'content_block_start', index: 5, content_block: { type: 'tool_use', id: 'toolu_new', name: 'get_sleep_summary', input: {} } }),
      ev({ type: 'content_block_delta', index: 5, delta: { type: 'input_json_delta', partial_json: '{"days":7}' } }),
      ev({ type: 'content_block_stop', index: 5 }),
      ev({
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 20, iterations: [{ type: 'message' }, { type: 'fallback_message', model: 'claude-opus-4-8' }] },
      }),
      ev({ type: 'message_stop' }),
    ]
    const events = await collect(readClaudeStream(streamFromChunks(stream)))
    expect(events.filter((e) => e.type === 'text_delta').map((e) => (e as { text: string }).text).join('')).toBe('Смотрю данные.')
    expect(events.filter((e) => e.type === 'tool_call')).toEqual([
      { type: 'tool_call', id: 'toolu_new', name: 'get_sleep_summary', input: { days: 7 } },
    ])
    const done = events.at(-1) as Extract<ChatEvent, { type: 'done' }>
    expect(done.stopReason).toBe('tool_use')
    expect(done.raw?.content).toEqual([
      { type: 'text', text: 'Смотрю ' },
      FB,
      { type: 'text', text: 'данные.' },
      { type: 'tool_use', id: 'toolu_new', name: 'get_sleep_summary', input: { days: 7 } },
    ])

    // The whole chain declined: still a refusal for the loop's notice.
    const refused = await collect(
      readClaudeStream(
        streamFromChunks([
          ev({ type: 'content_block_start', index: 0, content_block: FB }),
          ev({ type: 'content_block_stop', index: 0 }),
          ev({ type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 0, iterations: [{ type: 'fallback_message' }] } }),
        ]),
      ),
    )
    expect(refused.at(-1)).toMatchObject({ type: 'done', stopReason: 'refusal' })
  })

  it('maps refusal and mid-stream errors', async () => {
    const refusal = await collect(
      readClaudeStream(streamFromChunks([ev({ type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 0 } })])),
    )
    expect(refusal.at(-1)).toMatchObject({ stopReason: 'refusal' })
    const err = await collect(
      readClaudeStream(streamFromChunks([ev({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })])),
    )
    expect(err).toEqual([{ type: 'error', message: claudeErrorMessage(529) }])
  })

  it('builds Messages API params: raw replay, tool_result first, image blocks', () => {
    const msgs = toClaudeMessages([
      {
        role: 'user',
        parts: [
          { type: 'image', mimeType: 'image/jpeg', data: 'B64' },
          { type: 'text', text: 'Оцени' },
        ],
      },
      {
        role: 'assistant',
        parts: [{ type: 'tool_call', id: 't1', name: 'log_food_entry', input: { name: 'Плов' } }],
        raw: {
          provider: 'claude',
          content: [
            { type: 'thinking', thinking: '', signature: 'S' },
            { type: 'tool_use', id: 't1', name: 'log_food_entry', input: { name: 'Плов' } },
          ],
        },
      },
      { role: 'user', parts: [{ type: 'text', text: 'note' }] },
      { role: 'user', parts: [{ type: 'tool_result', id: 't1', name: 'log_food_entry', output: { ok: true } }] },
    ])
    expect(msgs).toHaveLength(3)
    expect(msgs[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'B64' } },
      { type: 'text', text: 'Оцени' },
    ])
    expect((msgs[1].content as { type: string }[])[0]).toEqual({ type: 'thinking', thinking: '', signature: 'S' })
    expect(msgs[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: '{"ok":true}' },
      { type: 'text', text: 'note' },
    ])
    expect(toClaudeTools([{ name: 'a', description: 'd', inputSchema: { properties: {} }, run: async () => 1 }])).toEqual([
      { name: 'a', description: 'd', input_schema: { properties: {}, type: 'object' } },
    ])
  })

  it('posts to the proxy URL and maps HTTP errors', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'slow down' } }), { status: 429 }))
    const p = createClaudeProvider({ proxyUrl: 'https://x.vercel.app/api/coach', fetchImpl: fetchImpl as unknown as typeof fetch })
    const events = await collect(p.chat({ system: 'S', messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }], tools: [] }))
    expect(events).toEqual([{ type: 'error', message: claudeErrorMessage(429) }])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://x.vercel.app/api/coach')
    expect(JSON.parse(String(init.body))).toEqual({
      system: 'S',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [],
    })
  })
})
