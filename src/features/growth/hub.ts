import type { LifeGoal, MoodEntry, Transaction } from '../../db/types'

export const CURRENCY_KEY = 'currency'

const CURRENCY_SYMBOL: Record<string, string> = { KZT: '₸', RUB: '₽', USD: '$', EUR: '€' }

/** Currency symbol for `settings['currency']`, default ₸. */
export function currencySymbol(code: unknown): string {
  return (typeof code === 'string' && CURRENCY_SYMBOL[code]) || '₸'
}

/** "12 500 ₸" */
export function money(amount: number, symbol: string): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ${symbol}`
}

/** Expenses in the month `YYYY-MM`: total and number of operations. */
export function monthExpenses(
  txs: Pick<Transaction, 'kind' | 'amount' | 'date'>[],
  month: string,
): { total: number; count: number } {
  let total = 0
  let count = 0
  for (const t of txs) {
    if (t.kind !== 'expense' || !t.date.startsWith(`${month}-`)) continue
    total += t.amount
    count++
  }
  return { total, count }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Progress of a goal 0..1 = mean of its key results (current / target, clamped); null without KRs. */
export function goalProgress(goal: Pick<LifeGoal, 'keyResults'>): number | null {
  const krs = goal.keyResults ?? []
  if (krs.length === 0) return null
  const sum = krs.reduce((s, kr) => s + (kr.target === 0 ? 0 : clamp01(kr.current / kr.target)), 0)
  return sum / krs.length
}

/** Active goals count and their average key-result progress (0..1, null if none have KRs). */
export function goalsSummary(goals: Pick<LifeGoal, 'status' | 'keyResults'>[]): {
  active: number
  avgProgress: number | null
} {
  const active = goals.filter((g) => g.status === 'active')
  const progresses = active.map(goalProgress).filter((p): p is number => p !== null)
  return {
    active: active.length,
    avgProgress: progresses.length ? progresses.reduce((s, p) => s + p, 0) / progresses.length : null,
  }
}

export const MOOD_EMOJI: Record<MoodEntry['mood'], string> = { 1: '😣', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }

/** Latest check-in per slot for a day. */
export function moodBySlot(entries: Pick<MoodEntry, 'slot' | 'mood' | 'createdAt'>[]): {
  morning?: MoodEntry['mood']
  evening?: MoodEntry['mood']
} {
  const out: { morning?: MoodEntry['mood']; evening?: MoodEntry['mood'] } = {}
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const e of sorted) out[e.slot] = e.mood
  return out
}
