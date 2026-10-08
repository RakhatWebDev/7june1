import type { CoachTool } from '../../coach/tools'
import { asObject, parseSse, safeJson } from './sse'
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

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash'
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/* ------------------------------ Wire types ------------------------------ */

export interface GeminiPart {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  inlineData?: { mimeType: string; data: string }
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> }
}

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiChunk {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number }
  promptFeedback?: { blockReason?: string }
  error?: { code?: number; message?: string; status?: string }
}

/* ------------------------------ Conversion ------------------------------ */

const SCHEMA_KEYS = new Set([
  'type',
  'description',
  'properties',
  'required',
  'items',
  'enum',
  'format',
  'nullable',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'title',
])

/**
 * Converts a JSON Schema (draft-07 subset) into Gemini's OpenAPI-subset `Schema`:
 * drops unsupported keywords (`additionalProperties`, `$schema`, `default`…) and
 * turns `type: ['x', 'null']` into `type: 'x', nullable: true`.
 */
export function toGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return { type: 'string' }
  const src = schema as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(src)) {
    if (!SCHEMA_KEYS.has(k)) continue
    if (k === 'type' && Array.isArray(v)) {
      const types = v.filter((t) => t !== 'null')
      out.type = types[0] ?? 'string'
      if (types.length !== v.length) out.nullable = true
    } else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([name, s]) => [name, toGeminiSchema(s)]),
      )
    } else if (k === 'items') {
      out.items = toGeminiSchema(v)
    } else {
      out[k] = v
    }
  }
  if (out.type === 'integer') out.format ??= 'int32'
  return out
}

export function toGeminiTools(tools: CoachTool[]) {
  if (tools.length === 0) return undefined
  return [
    {
      functionDeclarations: tools.map((t) => {
        const params = toGeminiSchema({ type: 'object', ...t.inputSchema })
        const props = params.properties as Record<string, unknown> | undefined
        // Gemini rejects OBJECT schemas with empty `properties` — omit parameters instead.
        const hasParams = props && Object.keys(props).length > 0
        return hasParams
          ? { name: t.name, description: t.description, parameters: params }
          : { name: t.name, description: t.description }
      }),
    },
  ]
}

function partToGemini(p: ChatPart): GeminiPart | null {
  switch (p.type) {
    case 'text':
      return p.text ? { text: p.text } : null
    case 'image':
      return { inlineData: { mimeType: p.mimeType, data: p.data } }
    case 'tool_call':
      return { functionCall: { name: p.name, args: p.input } }
    case 'tool_result':
      return {
        functionResponse: {
          name: p.name,
          response: p.isError ? { error: p.output } : asObject(p.output),
        },
      }
  }
}

/** Converts neutral turns into Gemini `contents`, merging consecutive same-role turns. */
export function toGeminiContents(turns: ChatTurn[]): GeminiContent[] {
  const out: GeminiContent[] = []
  for (const turn of turns) {
    const role = turn.role === 'assistant' ? 'model' : 'user'
    const parts =
      turn.raw?.provider === 'gemini' && Array.isArray(turn.raw.content)
        ? (turn.raw.content as GeminiPart[])
        : (turn.parts.map(partToGemini).filter(Boolean) as GeminiPart[])
    if (parts.length === 0) continue
    // The conversation must start with a user turn.
    if (out.length === 0 && role === 'model') continue
    const last = out[out.length - 1]
    if (last && last.role === role) last.parts.push(...parts)
    else out.push({ role, parts: [...parts] })
  }
  return out
}

/* -------------------------------- Errors -------------------------------- */

/** Russian message for an HTTP error from the Gemini API. */
export function geminiErrorMessage(status: number, apiMessage = ''): string {
  const m = apiMessage.toLowerCase()
  if (status === 429)
    return 'Лимит бесплатного тарифа Gemini исчерпан. Подожди минуту (или до завтра, если кончился дневной лимит) и попробуй снова.'
  if (status === 400 && (m.includes('api key') || m.includes('api_key')))
    return 'Ключ Gemini недействителен. Проверь его в настройках ИИ-тренера.'
  if (status === 401 || status === 403)
    return 'Gemini отклонил ключ (доступ запрещён). Проверь ключ в настройках или создай новый в aistudio.google.com.'
  if (status === 404) return 'Модель Gemini не найдена. Проверь название модели в настройках.'
  if (status === 400) return `Gemini не принял запрос: ${apiMessage || 'неверный формат'}.`
  if (status >= 500) return 'Сервис Gemini временно недоступен. Попробуй позже.'
  return `Ошибка Gemini (${status}). ${apiMessage}`.trim()
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  const json = safeJson(text) as GeminiChunk | GeminiChunk[] | undefined
  const err = Array.isArray(json) ? json[0]?.error : json?.error
  return err?.message ?? ''
}

function mapFinish(reason: string | undefined, hadCalls: boolean): StopReason {
  if (hadCalls) return 'tool_use'
  switch (reason) {
    case undefined:
    case 'STOP':
      return 'end_turn'
    case 'MAX_TOKENS':
      return 'max_tokens'
    case 'SAFETY':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
    case 'IMAGE_SAFETY':
      return 'refusal'
    default:
      return 'other'
  }
}

/** Merges adjacent plain text parts (no signatures) so replayed history stays compact. */
function compactParts(parts: GeminiPart[]): GeminiPart[] {
  const out: GeminiPart[] = []
  for (const p of parts) {
    const prev = out[out.length - 1]
    const plain = (x: GeminiPart) =>
      typeof x.text === 'string' && !x.thought && !x.thoughtSignature && Object.keys(x).length === 1
    if (prev && plain(prev) && plain(p)) prev.text = (prev.text ?? '') + p.text
    else out.push({ ...p })
  }
  return out
}

/* ------------------------------- Streaming ------------------------------- */

/** Turns a Gemini `streamGenerateContent?alt=sse` body into neutral chat events. */
export async function* readGeminiStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const parts: GeminiPart[] = []
  let finish: string | undefined
  let blocked: string | undefined
  let usage: Usage | undefined
  let calls = 0

  for await (const msg of parseSse(body, signal)) {
    const chunk = safeJson(msg.data) as GeminiChunk | undefined
    if (!chunk) continue
    if (chunk.error) {
      yield { type: 'error', message: geminiErrorMessage(chunk.error.code ?? 500, chunk.error.message) }
      return
    }
    if (chunk.promptFeedback?.blockReason) blocked = chunk.promptFeedback.blockReason
    if (chunk.usageMetadata) {
      usage = {
        inputTokens: chunk.usageMetadata.promptTokenCount,
        outputTokens:
          (chunk.usageMetadata.candidatesTokenCount ?? 0) + (chunk.usageMetadata.thoughtsTokenCount ?? 0),
        cacheReadTokens: chunk.usageMetadata.cachedContentTokenCount,
      }
    }
    const cand = chunk.candidates?.[0]
    if (!cand) continue
    if (cand.finishReason) finish = cand.finishReason
    for (const part of cand.content?.parts ?? []) {
      parts.push(part)
      if (part.functionCall) {
        calls++
        yield {
          type: 'tool_call',
          id: part.functionCall.id ?? `gemini-${Date.now().toString(36)}-${calls}`,
          name: part.functionCall.name,
          input: part.functionCall.args ?? {},
        }
      } else if (part.text && !part.thought) {
        yield { type: 'text_delta', text: part.text }
      }
    }
  }
  if (signal?.aborted) return

  yield {
    type: 'done',
    stopReason: blocked ? 'refusal' : mapFinish(finish, calls > 0),
    usage,
    raw: { provider: 'gemini', content: compactParts(parts) },
  }
}

export interface GeminiOptions {
  apiKey: string
  model?: string
  fetchImpl?: typeof fetch
}

export function createGeminiProvider(opts: GeminiOptions): Provider {
  const model = opts.model?.trim() || GEMINI_DEFAULT_MODEL
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  return {
    id: 'gemini',
    label: 'Gemini',
    isConfigured: (s: AiSettings) => s.geminiKey.trim().length > 0,
    async *chat(req: ChatRequest) {
      const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.apiKey.trim())}`
      const tools = toGeminiTools(req.tools)
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: toGeminiContents(req.messages),
        ...(tools ? { tools } : {}),
        generationConfig: { maxOutputTokens: 8192 },
      }
      let res: Response
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: req.signal,
        })
      } catch (e) {
        if (req.signal?.aborted) return
        yield { type: 'error', message: networkMessage(e) }
        return
      }
      if (!res.ok || !res.body) {
        yield { type: 'error', message: geminiErrorMessage(res.status, await readError(res)) }
        return
      }
      try {
        yield* readGeminiStream(res.body, req.signal)
      } catch (e) {
        if (req.signal?.aborted) return
        yield { type: 'error', message: networkMessage(e) }
      }
    },
  }
}

function networkMessage(e: unknown): string {
  return e instanceof ProviderError
    ? e.message
    : 'Не удалось связаться с Gemini. Проверь интернет-соединение.'
}

/** Cheap connectivity check: fetches the model metadata (no tokens spent). */
export async function checkGemini(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const m = model.trim() || GEMINI_DEFAULT_MODEL
  let res: Response
  try {
    res = await fetchImpl(`${GEMINI_BASE}/models/${encodeURIComponent(m)}?key=${encodeURIComponent(apiKey.trim())}`)
  } catch {
    throw new ProviderError('Не удалось связаться с Gemini. Проверь интернет-соединение.')
  }
  if (!res.ok) throw new ProviderError(geminiErrorMessage(res.status, await readError(res)), res.status)
  const info = (await res.json().catch(() => ({}))) as { displayName?: string }
  return info.displayName ?? m
}
