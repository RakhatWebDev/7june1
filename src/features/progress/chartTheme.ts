import { useReduceMotion } from '../../components/ui/helpers'

/** Shared Recharts styling for the progress screen (design tokens via CSS variables). */
export const AXIS_TICK = { fill: 'var(--color-muted)', fontSize: 11 }
export const GRID_STROKE = 'var(--color-border)'
export const SERIES = 'var(--color-accent)'
export const SERIES_SECONDARY = 'var(--color-info)'
export const SERIES_AVG = 'var(--color-accent)'
export const TOOLTIP_PROPS = {
  contentStyle: {
    background: 'color-mix(in srgb, var(--color-surface-2) 92%, transparent)',
    border: '1px solid rgb(255 255 255 / 0.08)',
    borderRadius: 14,
    boxShadow: 'var(--shadow-float)',
    backdropFilter: 'blur(12px)',
    color: 'var(--color-text)',
    fontSize: 12,
    padding: '8px 12px',
  },
  labelStyle: { color: 'var(--color-muted)', marginBottom: 2 },
  itemStyle: { color: 'var(--color-text)', fontWeight: 600, padding: 0 },
  cursor: { stroke: 'rgb(255 255 255 / 0.12)', fill: 'rgb(255 255 255 / 0.04)' },
}

/** Recharts entry animation shared by all progress charts: 600 ms ease-out, off under reduced motion. */
export function useChartAnimation() {
  const reduce = useReduceMotion()
  return {
    isAnimationActive: !reduce,
    animationDuration: 600,
    animationEasing: 'ease-out',
  } as const
}

/** "2026-10-07" → "07.10" */
export function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
}

/** "2026-10-07" → "07.10.2026" */
export function longDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}
