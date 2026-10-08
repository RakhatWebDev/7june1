import type Anthropic from '@anthropic-ai/sdk'
import type { CoachTool } from '../../coach/tools'
import { compactJson, parseSse, safeJson } from './sse'
import {
  ProviderError,
  type AiSettings,
  type ChatEvent,
  type ChatPart,
  type ChatRequest,
  type ChatTurn,
  type Provider,
  type StopReason,
  type Usage,
} from './types'

export const CLAUDE_DEFAULT_PROXY = '/api/coach'

/** Body the browser posts to the stateless proxy (`api/coach.ts`). */
export interface ClaudeProxyRequest {
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  tools: Anthropic.Beta.BetaTool[]
}

/* ------------------------------ Conversion ------------------------------ */

export function toClaudeTools(tools: CoachTool[]): Anthropic.Beta.BetaTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: { ...t.inputSchema, type: 'object' } as Anthropic.Beta.BetaTool.InputSchema,
  }))
}

function partToBlock(p: ChatPart): Anthropic.Beta.BetaContentBlockParam | null {
  switch (p.type) {
    case 'text':
      return p.text.trim() ? { type: 'text', text: p.text } : null
    case 'image':
      return { type: 'image', source: { type: 'base64', media_type: p.mimeType, data: p.data } }
    case 'tool_call':
      return { type: 'tool_use', id: p.id, name: p.name, input: p.input }
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: p.id,
        content: compactJson(p.output),
        ...(p.isError ? { is_error: true } : {}),
      }
  }
}

/**
 * Converts neutral turns into Messages API params. Assistant turns produced by Claude in
 * this loop are replayed verbatim (thinking blocks + signatures must come back unchanged);
 * tool_result blocks are placed first in their user message as the API requires.
 */
export function toClaudeMessages(turns: ChatTurn[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = []
  for (const turn of turns) {
    let blocks: Anthropic.Beta.BetaContentBlockParam[]
    if (turn.role === 'assistant' && turn.raw?.provider === 'claude' && Array.isArray(turn.raw.content)) {
      blocks = turn.raw.content as Anthropic.Beta.BetaContentBlockParam[]
    } else {
      blocks = turn.parts.map(partToBlock).filter((b): b is Anthropic.Beta.BetaContentBlockParam => b !== null)
    }
    if (blocks.length === 0) continue
    if (out.length === 0 && turn.role === 'assistant') continue
    const last = out[out.length - 1]
    if (last && last.role === turn.role && Array.isArray(last.content)) {
      last.content.push(...blocks)
    } else {
      out.push({ role: turn.role, content: [...blocks] })
    }
  }
  for (const m of out) {
    if (m.role === 'user' && Array.isArray(m.content)) {
      const results = m.content.filter((b) => b.type === 'tool_result')
      if (results.length > 0) m.content = [...results, ...m.content.filter((b) => b.type !== 'tool_result')]
    }
  }
  return out
}

/* -------------------------------- Errors -------------------------------- */

/** Russian message for an HTTP error from the proxy. */
export function claudeErrorMessage(status: number, apiMessage = ''): string {
  if (status === 429) return 'Слишком много запросов к Claude. Подожди минуту и попробуй снова.'
  if (status === 403) return 'Прокси Claude отклонил запрос с этого сайта (проверь ALLOWED_ORIGIN на сервере).'
  if (status === 401) return 'Ключ Anthropic на сервере неверный или не задан (ANTHROPIC_API_KEY).'
  if (status === 404 || status === 405)
    return 'Прокси Claude не найден по этому адресу. Проверь URL прокси в настройках.'
  if (status === 413) return 'Запрос слишком большой (возможно, фото). Попробуй ещё раз.'
  if (status === 529 || status === 503) return 'Claude сейчас перегружен. Попробуй через минуту.'
  if (status === 400) return `Claude не принял запрос: ${apiMessage || 'неверный формат'}.`
  if (status >= 500) return `Ошибка прокси Claude (${status}). ${apiMessage}`.trim()
  return `Ошибка Claude (${status}). ${apiMessage}`.trim()
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  const json = safeJson(text) as { error?: { message?: string } | string } | undefined
  const err = json?.error
  return typeof err === 'string' ? err : (err?.message ?? '')
}

function mapStop(reason: string | null | undefined): StopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn'
    case 'tool_use':
      return 'tool_use'
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens'
    case 'refusal':
      return 'refusal'
    default:
      return 'other'
  }
}

/* ------------------------------- Streaming ------------------------------- */

type Block = Record<string, unknown> & { type: string }

/**
 * Turns a Messages API SSE stream (as forwarded by the proxy) into neutral events.
 * Accumulates every content block — text, thinking (+ signature), redacted thinking,
 * tool_use (+ partial JSON), server-side `fallback` markers — so the assistant turn can
 * be replayed. `fallback` blocks and `usage.iterations` (incl. `fallback_message`
 * entries) are not rendered; a final `refusal` still ends the turn with a notice.
 */
export async function* readClaudeStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const blocks: Block[] = []
  const partialJson = new Map<number, string>()
  let stop: string | null | undefined
  const usage: Usage = {}

  for await (const msg of parseSse(body, signal)) {
    const ev = safeJson(msg.data) as (Anthropic.RawMessageStreamEvent | { type: 'error'; error?: { type?: string; message?: string; status?: number } }) | undefined
    if (!ev) continue
    switch (ev.type) {
      case 'message_start':
        usage.inputTokens = ev.message.usage.input_tokens
        usage.cacheReadTokens = ev.message.usage.cache_read_input_tokens ?? undefined
        usage.outputTokens = ev.message.usage.output_tokens
        break
      case 'content_block_start': {
        const b = { ...(ev.content_block as unknown as Block) }
        if (b.type === 'tool_use') partialJson.set(ev.index, '')
        blocks[ev.index] = b
        break
      }
      case 'content_block_delta': {
        const b = blocks[ev.index]
        if (!b) break
        const d = ev.delta
        if (d.type === 'text_delta') {
          b.text = String(b.text ?? '') + d.text
          yield { type: 'text_delta', text: d.text }
        } else if (d.type === 'thinking_delta') {
          b.thinking = String(b.thinking ?? '') + d.thinking
        } else if (d.type === 'signature_delta') {
          b.signature = d.signature
        } else if (d.type === 'input_json_delta') {
          partialJson.set(ev.index, (partialJson.get(ev.index) ?? '') + d.partial_json)
        }
        break
      }
      case 'content_block_stop': {
        const b = blocks[ev.index]
        if (b?.type === 'tool_use') {
          const json = partialJson.get(ev.index) ?? ''
          const parsed = json.trim() ? safeJson(json) : {}
          b.input = parsed && typeof parsed === 'object' ? parsed : {}
        }
        // Citations are irrelevant for replay and not accepted back on every block type.
        if (b?.type === 'text' && 'citations' in b) delete b.citations
        break
      }
      case 'message_delta':
        stop = ev.delta.stop_reason
        if (ev.usage?.output_tokens != null) usage.outputTokens = ev.usage.output_tokens
        break
      case 'error': {
        const status = ev.error?.status ?? (ev.error?.type === 'overloaded_error' ? 529 : ev.error?.type === 'rate_limit_error' ? 429 : 500)
        yield { type: 'error', message: claudeErrorMessage(status, ev.error?.message) }
        return
      }
      default:
        break
    }
  }
  if (signal?.aborted) return

  const stopReason = mapStop(stop)
  const content = blocks.filter(Boolean)
  const boundary = lastFallbackIndex(content)
  // Tool calls are emitted only for a completed tool_use turn — a call cut off by
  // max_tokens may carry truncated input and must not run. Calls made by a model
  // that then declined (before a `fallback` boundary) are never run either.
  if (stopReason === 'tool_use') {
    for (const b of content.slice(boundary + 1)) {
      if (b.type === 'tool_use') {
        yield {
          type: 'tool_call',
          id: String(b.id),
          name: String(b.name),
          input: (b.input as Record<string, unknown>) ?? {},
        }
      }
    }
  }
  yield {
    type: 'done',
    stopReason,
    usage,
    raw: { provider: 'claude', content: replayContent(content, boundary) },
  }
}

/** Index of the last server-side `fallback` block (a refusal hop), or -1. */
function lastFallbackIndex(content: Block[]): number {
  for (let i = content.length - 1; i >= 0; i--) if (content[i].type === 'fallback') return i
  return -1
}

/**
 * Assistant content to echo back on the next request. After a mid-output fallback,
 * only `text` blocks survive from before the final `fallback` boundary (the declined
 * model's thinking / tool_use / other internal blocks are dropped, per the API's echo
 * rules); the boundary block and everything after it are kept verbatim.
 */
export function replayContent(content: Block[], boundary = lastFallbackIndex(content)): Block[] {
  if (boundary < 0) return content
  return [...content.slice(0, boundary).filter((b) => b.type === 'text'), ...content.slice(boundary)]
}

export interface ClaudeOptions {
  proxyUrl?: string
  fetchImpl?: typeof fetch
}

export function createClaudeProvider(opts: ClaudeOptions = {}): Provider {
  const url = opts.proxyUrl?.trim() || CLAUDE_DEFAULT_PROXY
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  return {
    id: 'claude',
    label: 'Claude',
    isConfigured: (s: AiSettings) => s.claudeProxyUrl.trim().length > 0,
    async *chat(req: ChatRequest) {
      const body: ClaudeProxyRequest = {
        system: req.system,
        messages: toClaudeMessages(req.messages),
        tools: toClaudeTools(req.tools),
      }
      let res: Response
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(body),
          signal: req.signal,
        })
      } catch {
        if (req.signal?.aborted) return
        yield { type: 'error', message: 'Не удалось связаться с прокси Claude. Проверь интернет и URL прокси.' }
        return
      }
      if (!res.ok || !res.body) {
        yield { type: 'error', message: claudeErrorMessage(res.status, await readError(res)) }
        return
      }
      try {
        yield* readClaudeStream(res.body, req.signal)
      } catch {
        if (req.signal?.aborted) return
        yield { type: 'error', message: 'Соединение с Claude прервалось. Попробуй ещё раз.' }
      }
    },
  }
}

/** Health check of the proxy (`GET` → `{ ok, model, configured }`), no tokens spent. */
export async function checkClaudeProxy(proxyUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const url = proxyUrl.trim() || CLAUDE_DEFAULT_PROXY
  let res: Response
  try {
    res = await fetchImpl(url, { method: 'GET' })
  } catch {
    throw new ProviderError('Не удалось связаться с прокси Claude. Проверь URL.')
  }
  if (!res.ok) throw new ProviderError(claudeErrorMessage(res.status, await readError(res)), res.status)
  const info = (await res.json().catch(() => null)) as { ok?: boolean; model?: string; configured?: boolean } | null
  if (!info?.ok) throw new ProviderError('По этому адресу отвечает не прокси FORMA. Проверь URL.')
  if (!info.configured) throw new ProviderError('Прокси работает, но на сервере не задан ANTHROPIC_API_KEY.')
  return info.model ?? 'Claude'
}
