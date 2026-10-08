import { useLiveQuery } from 'dexie-react-hooks'
import { db, type FormaDB } from '../../db'
import { CLAUDE_DEFAULT_PROXY, createClaudeProvider } from './providers/claude'
import { GEMINI_DEFAULT_MODEL, createGeminiProvider } from './providers/gemini'
import type { AiSettings, Provider } from './providers/types'

/** `db.settings` keys owned by the assistant. */
export const AI_KEYS = {
  provider: 'ai.provider',
  geminiKey: 'ai.gemini.key',
  geminiModel: 'ai.gemini.model',
  claudeProxyUrl: 'ai.claude.proxyUrl',
} as const satisfies Record<keyof AiSettings, string>

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'off',
  geminiKey: '',
  geminiModel: GEMINI_DEFAULT_MODEL,
  claudeProxyUrl: CLAUDE_DEFAULT_PROXY,
}

const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)

export async function loadAiSettings(database: FormaDB = db): Promise<AiSettings> {
  const rows = await database.settings.bulkGet(Object.values(AI_KEYS))
  const [provider, geminiKey, geminiModel, claudeProxyUrl] = rows.map((r) => r?.value)
  const p = str(provider, 'off')
  return {
    provider: p === 'gemini' || p === 'claude' ? p : 'off',
    geminiKey: str(geminiKey, ''),
    geminiModel: str(geminiModel, '').trim() || GEMINI_DEFAULT_MODEL,
    claudeProxyUrl: str(claudeProxyUrl, '').trim() || CLAUDE_DEFAULT_PROXY,
  }
}

export async function saveAiSettings(next: Partial<AiSettings>, database: FormaDB = db): Promise<void> {
  const rows = (Object.keys(next) as (keyof AiSettings)[]).map((k) => ({ key: AI_KEYS[k], value: next[k] }))
  await database.settings.bulkPut(rows)
}

/** Live AI settings; `undefined` while loading. */
export function useAiSettings(): AiSettings | undefined {
  return useLiveQuery(() => loadAiSettings(), [])
}

/** Builds the provider selected in settings, or `null` when off / not configured. */
export function providerFromSettings(s: AiSettings): Provider | null {
  if (s.provider === 'gemini') {
    const p = createGeminiProvider({ apiKey: s.geminiKey, model: s.geminiModel })
    return p.isConfigured(s) ? p : null
  }
  if (s.provider === 'claude') {
    const p = createClaudeProvider({ proxyUrl: s.claudeProxyUrl })
    return p.isConfigured(s) ? p : null
  }
  return null
}
