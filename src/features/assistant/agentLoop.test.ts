import { describe, expect, it, vi } from 'vitest'
import { FormaDB } from '../../db'
import { runAgentLoop, type LoopEvent } from './agentLoop'
import { mockTool, scriptedProvider } from './test/mockProvider'
import type { ChatTurn } from './providers/types'

const db = new FormaDB('test-assistant-loop')
const question: ChatTurn[] = [{ role: 'user', parts: [{ type: 'text', text: 'Что делать сегодня?' }] }]

async function drive(gen: AsyncGenerator<LoopEvent>, onConfirm?: (e: Extract<LoopEvent, { type: 'confirm' }>) => void) {
  const events: LoopEvent[] = []
  for await (const e of gen) {
    events.push(e)
    if (e.type === 'confirm') onConfirm?.(e)
  }
  return events
}

describe('runAgentLoop', () => {
  it('runs a read tool, sends the result back and finishes with the final text', async () => {
    const run = vi.fn(async (input: Record<string, unknown>) => ({ day: 'Push', days: input.days }))
    const { provider, requests } = scriptedProvider([
      [
        { type: 'text_delta', text: 'Смотрю план.' },
        { type: 'tool_call', id: 'c1', name: 'get_todays_plan', input: { days: 1 } },
        { type: 'done', stopReason: 'tool_use', raw: { provider: 'gemini', content: [{ text: 'raw' }] } },
      ],
      [
        { type: 'text_delta', text: 'Сегодня Push: жим 3×5.' },
        { type: 'done', stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 5 } },
      ],
    ])
    const events = await drive(
      runAgentLoop({ provider, system: 'S', history: question, tools: [mockTool('get_todays_plan', run)], db }),
    )

    expect(run).toHaveBeenCalledWith({ days: 1 }, db)
    expect(requests).toHaveLength(2)
    const second = requests[1].messages
    expect(second[1]).toMatchObject({ role: 'assistant', raw: { provider: 'gemini' } })
    expect(second[2]).toEqual({
      role: 'user',
      parts: [{ type: 'tool_result', id: 'c1', name: 'get_todays_plan', output: { day: 'Push', days: 1 }, isError: undefined }],
    })
    const done = events.at(-1) as Extract<LoopEvent, { type: 'done' }>
    expect(done.type).toBe('done')
    expect(done.text).toBe('Смотрю план.\n\nСегодня Push: жим 3×5.')
    expect(done.toolCalls).toEqual([
      { id: 'c1', name: 'get_todays_plan', input: { days: 1 }, output: { day: 'Push', days: 1 }, status: 'ok' },
    ])
    expect(done.usage).toMatchObject({ inputTokens: 10, outputTokens: 5 })
  })

  it('asks for confirmation before a mutating tool and writes only when approved', async () => {
    const write = vi.fn(async () => ({ saved: true }))
    const script = () =>
      scriptedProvider([
        [
          { type: 'tool_call', id: 'w1', name: 'log_weight', input: { weightKg: 82.4 } },
          { type: 'done', stopReason: 'tool_use' },
        ],
        [{ type: 'text_delta', text: 'Ок.' }, { type: 'done', stopReason: 'end_turn' }],
      ])
    const tools = [mockTool('log_weight', write, true)]

    const approved = script()
    const events = await drive(
      runAgentLoop({ provider: approved.provider, system: 'S', history: question, tools, db }),
      (e) => e.respond(true),
    )
    const confirm = events.find((e) => e.type === 'confirm')
    expect(confirm).toMatchObject({ name: 'log_weight', input: { weightKg: 82.4 } })
    // The tool runs only after the confirmation event.
    expect(events.findIndex((e) => e.type === 'confirm')).toBeLessThan(events.findIndex((e) => e.type === 'tool_end'))
    expect(write).toHaveBeenCalledTimes(1)

    write.mockClear()
    const declined = script()
    const events2 = await drive(
      runAgentLoop({ provider: declined.provider, system: 'S', history: question, tools, db }),
      (e) => e.respond(false),
    )
    expect(write).not.toHaveBeenCalled()
    expect(events2.find((e) => e.type === 'tool_end')).toMatchObject({ record: { status: 'declined' } })
    const result = declined.requests[1].messages.at(-1)!.parts[0]
    expect(result).toMatchObject({ type: 'tool_result', output: { declined: true } })
  })

  it('caps tool executions per turn and reports tool errors to the model', async () => {
    const run = vi.fn(async () => ({ ok: 1 }))
    const calls = Array.from({ length: 3 }, (_, i) => ({ type: 'tool_call' as const, id: `c${i}`, name: 'get_sleep_summary', input: {} }))
    const { provider, requests } = scriptedProvider([
      [...calls, { type: 'done', stopReason: 'tool_use' }],
      [{ type: 'tool_call', id: 'bad', name: 'nope', input: {} }, { type: 'done', stopReason: 'tool_use' }],
      [{ type: 'text_delta', text: 'Итог' }, { type: 'done', stopReason: 'end_turn' }],
    ])
    const events = await drive(
      runAgentLoop({ provider, system: 'S', history: question, tools: [mockTool('get_sleep_summary', run)], db, maxToolCalls: 2 }),
    )
    expect(run).toHaveBeenCalledTimes(2)
    const results = requests[1].messages.at(-1)!.parts
    expect(results[2]).toMatchObject({ isError: true, output: { error: expect.stringMatching(/limit/) } })
    expect(requests[2].messages.at(-1)!.parts[0]).toMatchObject({ isError: true, output: { error: 'Unknown tool: nope' } })
    expect(events.at(-1)).toMatchObject({ type: 'done', text: 'Итог' })
  })

  it('surfaces provider errors with the partial text', async () => {
    const { provider } = scriptedProvider([[{ type: 'text_delta', text: 'Нач' }, { type: 'error', message: 'Лимит' }]])
    const events = await drive(runAgentLoop({ provider, system: 'S', history: question, tools: [], db }))
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Лимит', text: 'Нач', toolCalls: [] })
  })

  it('stops with a notice on refusal and max_tokens', async () => {
    const { provider } = scriptedProvider([[{ type: 'done', stopReason: 'max_tokens' }]])
    const events = await drive(runAgentLoop({ provider, system: 'S', history: question, tools: [], db }))
    expect(events.map((e) => e.type)).toEqual(['notice', 'done'])
  })
})
