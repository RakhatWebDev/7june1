/** Shared Recharts styling for the progress screen (design tokens via CSS variables). */
export const AXIS_TICK = { fill: 'var(--color-muted)', fontSize: 11 }
export const GRID_STROKE = 'var(--color-border)'
export const SERIES = 'var(--color-accent)'
export const SERIES_SECONDARY = 'var(--color-info)'
export const TOOLTIP_PROPS = {
  contentStyle: {
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    color: 'var(--color-text)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--color-muted)' },
  itemStyle: { color: 'var(--color-text)' },
  cursor: { stroke: 'var(--color-border)', fill: 'var(--color-surface-2)' },
}

/** "2026-10-07" → "07.10" */
export function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
}

/** "2026-10-07" → "07.10.2026" */
export function longDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}
