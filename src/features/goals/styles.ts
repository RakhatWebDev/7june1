/** Recharts styling via design tokens (mirrors the progress feature). */
export const AXIS_TICK = { fill: 'var(--color-muted)', fontSize: 11 }
export const GRID_STROKE = 'var(--color-border)'
export const SERIES = 'var(--color-accent)'

/** A react-router <Link> that looks like the shared primary / secondary Button. */
export const LINK_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:bg-accent-strong'
export const LINK_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-2 text-sm text-text transition hover:bg-border'

export const TEXTAREA_CLASS =
  'w-full resize-y rounded-xl border border-border bg-surface-2 px-3 py-2 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none'

export const TONE_CLASS = {
  good: 'text-accent',
  bad: 'text-danger',
  neutral: 'text-muted',
} as const

/** "2026-03-01" → "01.03.2026" */
export function longDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}
