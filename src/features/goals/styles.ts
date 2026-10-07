import { buttonClasses } from '../../components/ui/helpers'

/** Recharts styling via design tokens (mirrors the progress feature). */
export const AXIS_TICK = { fill: 'var(--color-muted)', fontSize: 11 }
export const GRID_STROKE = 'var(--color-border)'
export const SERIES = 'var(--color-accent)'

/** A react-router <Link> that looks like the shared primary / secondary Button. */
export const LINK_PRIMARY = buttonClasses({ variant: 'primary' })
export const LINK_SECONDARY = buttonClasses({ variant: 'secondary' })

export const TEXTAREA_CLASS =
  'w-full resize-y rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-base text-text placeholder:text-muted/70 transition-[border-color,box-shadow] focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/20'

const EASE_OUT = [0.22, 1, 0.36, 1] as const

/** Fade-up entrance for the `i`-th list item (40 ms stagger, capped at 10); none under reduced motion. */
export function staggerItem(i: number, reduce: boolean) {
  return {
    initial: reduce ? (false as const) : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.32, ease: EASE_OUT, delay: Math.min(i, 9) * 0.04 },
  }
}

export const TONE_CLASS = {
  good: 'text-accent',
  bad: 'text-danger',
  neutral: 'text-muted',
} as const

/** "2026-03-01" → "01.03.2026" */
export function longDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}
