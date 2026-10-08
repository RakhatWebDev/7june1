import type { FormaDB } from '../../db'
import type { CoachTool } from '../coach/tools'
import type { ChatEvent, ChatPart, ChatTurn, Provider, Usage } from './providers/types'

/** Max tool executions per user turn (spec: up to 6). */
export const MAX_TOOL_CALLS = 6

export interface ToolCallRecord {
  id: string
  name: string
  input: Record<string, unknown>
  output: unknown
  status: 'ok' | 'error' | 'declined'
}

export type LoopEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_end'; record: ToolCallRecord }
  /** A mutating tool wants to write; the UI must call `respond` (true = write). */
  | {
      type: 'confirm'
      id: string
      name: string
      input: Record<string, unknown>
      respond: (approved: boolean) => void
    }
  | { type: 'notice'; message: string }
  | { type: 'done'; text: string; toolCalls: ToolCallRecord[]; usage: Usage }
  | { type: 'error'; message: string; text: string; toolCalls: ToolCallRecord[] }

export interface AgentLoopOptions {
  provider: Provider
  system: string
  /** Conversation so far, ending with the new user turn */
  history: ChatTurn[]
  tools: CoachTool[]
  db: FormaDB
  signal?: AbortSignal
  maxToolCalls?: number
}

const LIMIT_OUTPUT = {
  error: 'Tool call limit for this turn reached. Answer now with the data you already have.',
}
const DECLINED_OUTPUT = {
  declined: true,
  message: 'The user declined this write. Nothing was saved. Do not retry; ask what to change instead.',
}

/**
 * Shared client-side tool loop: provider stream → run requested tools in the browser →
 * send results back → … until the model answers without tools. Mutating tools wait
 * for the user's confirmation (`confirm` event). Provider-agnostic.
 */
export async function* runAgentLoop(opts: AgentLoopOptions): AsyncGenerator<LoopEvent> {
  const { provider, system, tools, db, signal } = opts
  const maxCalls = opts.maxToolCalls ?? MAX_TOOL_CALLS
  // One extra round lets the model answer after the limit was hit.
  const maxRounds = maxCalls + 2
  const turns: ChatTurn[] = [...opts.history]
  const records: ToolCallRecord[] = []
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
  let text = ''
  let executed = 0

  for (let round = 0; round < maxRounds; round++) {
    const calls: Extract<ChatEvent, { type: 'tool_call' }>[] = []
    let done: Extract<ChatEvent, { type: 'done' }> | undefined
    let roundText = ''

    for await (const ev of provider.chat({ system, messages: turns, tools, signal })) {
      if (signal?.aborted) return
      if (ev.type === 'text_delta') {
        if (!ev.text) continue
        const chunk = !roundText && text ? `\n\n${ev.text}` : ev.text
        roundText += ev.text
        text += chunk
        yield { type: 'text_delta', text: chunk }
      } else if (ev.type === 'tool_call') {
        calls.push(ev)
      } else if (ev.type === 'done') {
        done = ev
      } else {
        yield { type: 'error', message: ev.message, text, toolCalls: records }
        return
      }
    }
    if (signal?.aborted) return
    if (!done) {
      yield { type: 'error', message: 'Ответ оборвался. Попробуй ещё раз.', text, toolCalls: records }
      return
    }
    usage.inputTokens! += done.usage?.inputTokens ?? 0
    usage.outputTokens! += done.usage?.outputTokens ?? 0
    usage.cacheReadTokens! += done.usage?.cacheReadTokens ?? 0

    turns.push({
      role: 'assistant',
      parts: [
        ...(roundText ? [{ type: 'text', text: roundText } as ChatPart] : []),
        ...calls.map((c): ChatPart => ({ type: 'tool_call', id: c.id, name: c.name, input: c.input })),
      ],
      raw: done.raw,
    })

    if (done.stopReason === 'refusal') {
      yield { type: 'notice', message: 'Тренер не может ответить на этот запрос. Попробуй переформулировать.' }
      break
    }
    if (done.stopReason === 'max_tokens') {
      yield { type: 'notice', message: 'Ответ получился слишком длинным и обрезан. Попроси продолжить или уточни вопрос.' }
      break
    }
    if (calls.length === 0) break
    if (round === maxRounds - 1) {
      yield { type: 'notice', message: 'Тренер сделал слишком много запросов к данным. Задай вопрос конкретнее.' }
      break
    }

    const results: ChatPart[] = []
    for (const call of calls) {
      if (signal?.aborted) return
      const tool = tools.find((t) => t.name === call.name)
      const base = { id: call.id, name: call.name, input: call.input }
      yield { type: 'tool_start', id: call.id, name: call.name, input: call.input }
      let record: ToolCallRecord
      if (!tool) {
        record = { ...base, output: { error: `Unknown tool: ${call.name}` }, status: 'error' }
      } else if (executed >= maxCalls) {
        record = { ...base, output: LIMIT_OUTPUT, status: 'error' }
      } else {
        executed++
        let approved = true
        if (tool.mutates) {
          let respond!: (ok: boolean) => void
          const decision = new Promise<boolean>((resolve) => {
            respond = resolve
            signal?.addEventListener('abort', () => resolve(false), { once: true })
          })
          yield { type: 'confirm', id: call.id, name: call.name, input: call.input, respond }
          approved = await decision
          if (signal?.aborted) return
        }
        if (!approved) {
          record = { ...base, output: DECLINED_OUTPUT, status: 'declined' }
        } else {
          try {
            record = { ...base, output: (await tool.run(call.input, db)) ?? null, status: 'ok' }
          } catch (e) {
            record = { ...base, output: { error: e instanceof Error ? e.message : String(e) }, status: 'error' }
          }
        }
      }
      records.push(record)
      yield { type: 'tool_end', record }
      results.push({
        type: 'tool_result',
        id: call.id,
        name: call.name,
        output: record.output,
        isError: record.status === 'error' || undefined,
      })
    }
    turns.push({ role: 'user', parts: results })
  }

  yield { type: 'done', text, toolCalls: records, usage }
}
