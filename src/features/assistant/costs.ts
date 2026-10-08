/** Claude Opus 5.5 list prices, USD per million tokens (Anthropic API, 2026). */
export const CLAUDE_PRICES = { input: 4, output: 20, cacheRead: 0.2 } as const

/**
 * Typical coach question: 1–3 API requests (tool loop). Each request re-sends the
 * system prompt + tools (~3k, cached after the first) and the growing history/tool output.
 */
export const TYPICAL_QUESTION = {
  low: { inputTokens: 6_000, cachedTokens: 3_000, outputTokens: 800 },
  high: { inputTokens: 25_000, cachedTokens: 9_000, outputTokens: 3_000 },
}

export function claudeCostUsd(t: { inputTokens: number; cachedTokens: number; outputTokens: number }): number {
  return (
    (t.inputTokens * CLAUDE_PRICES.input + t.cachedTokens * CLAUDE_PRICES.cacheRead + t.outputTokens * CLAUDE_PRICES.output) /
    1_000_000
  )
}

/** USD range for `questions` typical questions. */
export function claudeCostRange(questions: number): [number, number] {
  return [claudeCostUsd(TYPICAL_QUESTION.low) * questions, claudeCostUsd(TYPICAL_QUESTION.high) * questions]
}

export function formatUsd(v: number): string {
  return v < 0.1 ? `$${v.toFixed(3).replace(/0$/, '')}` : `$${v.toFixed(2)}`
}
