import { addDays } from 'date-fns'
import { fromISODate, toISODate } from '../../lib/dates'

/** Shift a YYYY-MM-DD date by `n` days (negative = past). */
export function shiftDate(date: string, n: number): string {
  return toISODate(addDays(fromISODate(date), n))
}

/** Inclusive list of dates from `from` to `to` (YYYY-MM-DD), ascending. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = shiftDate(d, 1)) out.push(d)
  return out
}

/** "07.10" */
export function ddmm(date: string): string {
  const [, m, d] = date.split('-')
  return `${d}.${m}`
}

export const COLOR_TOKENS = ['accent', 'info', 'warn', 'danger', 'violet', 'pink'] as const
export type ColorToken = (typeof COLOR_TOKENS)[number]

/** CSS colour for a token; violet/pink fall back to literals until the design tokens exist. */
export function colorVar(token: string | undefined): string {
  switch (token) {
    case 'info':
      return 'var(--color-info)'
    case 'warn':
      return 'var(--color-warn)'
    case 'danger':
      return 'var(--color-danger)'
    case 'violet':
      return 'var(--color-violet, #a78bfa)'
    case 'pink':
      return 'var(--color-pink, #f472b6)'
    default:
      return 'var(--color-accent)'
  }
}

/** Translucent tint of a token colour for backgrounds. */
export function tint(token: string | undefined, pct = 15): string {
  return `color-mix(in srgb, ${colorVar(token)} ${pct}%, transparent)`
}
