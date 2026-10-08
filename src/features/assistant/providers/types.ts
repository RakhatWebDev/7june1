import type { CoachTool } from '../../coach/tools'

/** Provider-neutral content of one conversation turn. */
export type ChatPart =
  | { type: 'text'; text: string }
  /** Base64 image without the `data:` prefix */
  | { type: 'image'; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; output: unknown; isError?: boolean }

export type ProviderId = 'gemini' | 'claude'

export interface ChatTurn {
  role: 'user' | 'assistant'
  parts: ChatPart[]
  /**
   * Provider-native assistant content (Claude content blocks incl. thinking signatures,
   * Gemini parts incl. thought signatures). Replayed verbatim to the same provider
   * so tool loops keep their reasoning context; other providers use `parts`.
   */
  raw?: { provider: ProviderId; content: unknown }
}

export interface ChatRequest {
  system: string
  messages: ChatTurn[]
  tools: CoachTool[]
  signal?: AbortSignal
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other'

export interface Usage {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
}

export type ChatEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | {
      type: 'done'
      stopReason: StopReason
      usage?: Usage
      /** Native assistant content to replay on the next request of the same loop */
      raw?: ChatTurn['raw']
    }
  | { type: 'error'; message: string }

/** Settings the providers read (stored under `ai.*` keys in `db.settings`). */
export interface AiSettings {
  provider: 'off' | ProviderId
  geminiKey: string
  geminiModel: string
  claudeProxyUrl: string
}

export interface Provider {
  id: ProviderId
  /** Human label for the UI */
  label: string
  isConfigured(settings: AiSettings): boolean
  chat(req: ChatRequest): AsyncIterable<ChatEvent>
}

/** Error with a ready-to-show Russian message. */
export class ProviderError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
  }
}
