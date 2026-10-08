/** One server-sent event: `event:` name (default "message") and joined `data:` lines. */
export interface SseMessage {
  event: string
  data: string
}

/**
 * Parses a `text/event-stream` body into events. Handles CRLF/LF line endings,
 * multi-line `data:` fields, comments (`:`) and chunks split at arbitrary bytes.
 */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseMessage> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = ''
  let data: string[] = []

  const flush = (): SseMessage | null => {
    if (data.length === 0) {
      event = ''
      return null
    }
    const msg = { event: event || 'message', data: data.join('\n') }
    event = ''
    data = []
    return msg
  }

  try {
    while (true) {
      if (signal?.aborted) return
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.search(/\r\n|\r|\n/)) >= 0) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + (buffer[nl] === '\r' && buffer[nl + 1] === '\n' ? 2 : 1))
        if (line === '') {
          const msg = flush()
          if (msg) yield msg
          continue
        }
        if (line.startsWith(':')) continue
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        let val = colon < 0 ? '' : line.slice(colon + 1)
        if (val.startsWith(' ')) val = val.slice(1)
        if (field === 'event') event = val
        else if (field === 'data') data.push(val)
      }
      if (done) {
        if (buffer) {
          // Unterminated last line
          if (buffer.startsWith('data:')) data.push(buffer.slice(5).replace(/^ /, ''))
          buffer = ''
        }
        const msg = flush()
        if (msg) yield msg
        return
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** JSON.parse that returns `undefined` instead of throwing. */
export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Builds a ReadableStream from string chunks — used by tests and fakes. */
export function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

/** Plain JSON-serialisable object for a tool output (providers want objects, not scalars). */
export function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return { result: value ?? null }
}

/** Serialises a tool output, capping its size so one tool can't blow up the context. */
export function compactJson(value: unknown, maxChars = 12_000): string {
  let s: string
  try {
    s = JSON.stringify(value ?? null)
  } catch {
    s = JSON.stringify({ error: 'unserialisable output' })
  }
  if (s.length <= maxChars) return s
  return JSON.stringify({ truncated: true, partial: s.slice(0, maxChars) })
}
