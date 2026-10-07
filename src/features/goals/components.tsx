import { Link } from 'react-router'
import type { LifeGoal } from '../../db/types'
import { Progress } from '../../components/ui'
import { areaMeta, GOAL_STATUS_RU } from './areas'
import { goalProgress, weekDeltas } from './calc'
import { formatDiff, formatMetric, METRICS } from './metrics'
import { TONE_CLASS, longDate } from './styles'

/** Read-only star rating, e.g. ★★★★☆ */
export function Stars({ value, className = '' }: { value: number | undefined; className?: string }) {
  const v = Math.max(0, Math.min(5, Math.round(value ?? 0)))
  return (
    <span className={`text-warn tabular-nums ${className}`} aria-label={`Оценка ${v} из 5`} role="img">
      {'★'.repeat(v)}
      <span className="text-border">{'★'.repeat(5 - v)}</span>
    </span>
  )
}

/** Tap-to-rate 1–5 stars. */
export function RatingInput({ value, onChange }: { value: number | undefined; onChange: (v: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Оценка недели">
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Оценка ${n}`}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={`flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition ${
            value != null && n <= value ? 'text-warn' : 'text-border hover:text-muted'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

/** Goal list item linking to its edit page. */
export function GoalRow({ goal }: { goal: LifeGoal }) {
  const pct = Math.round(goalProgress(goal))
  const area = areaMeta(goal.area)
  return (
    <li>
      <Link
        to={`/goals/${goal.id}`}
        className="block rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/50"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-xl leading-none">
            {area.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="truncate font-semibold">{goal.title}</h3>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{pct}%</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {goal.status !== 'active' && <span className="mr-2">{GOAL_STATUS_RU[goal.status]}</span>}
              {goal.keyResults.length > 0 ? `${goal.keyResults.length} KR` : 'Без ключевых результатов'}
              {goal.deadline && ` · до ${longDate(goal.deadline)}`}
            </p>
            <Progress value={pct / 100} className="mt-2" />
          </div>
        </div>
      </Link>
    </li>
  )
}

const ARROW = { up: '↑', down: '↓', flat: '→' } as const

/**
 * Grid of weekly metrics with the change against the previous week.
 * Metrics that are zero in both weeks are hidden unless `showAll`.
 */
export function StatGrid({
  current,
  previous,
  currency,
  showAll = false,
}: {
  current: Record<string, number>
  previous: Record<string, number> | undefined
  currency: string
  showAll?: boolean
}) {
  const deltas = weekDeltas(current, previous).filter((d) => showAll || d.current !== 0 || d.previous !== 0)
  if (deltas.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">За эту неделю пока нет данных.</p>
  }
  const meta = new Map(METRICS.map((m) => [m.key, m]))
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Цифры недели">
      {deltas.map((d) => {
        const m = meta.get(d.key)!
        return (
          <li key={d.key} className="rounded-2xl border border-border bg-surface p-3" data-testid={`stat-${d.key}`}>
            <div className="text-xs text-muted">{m.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatMetric(m.format, d.current, currency)}</div>
            <div className={`text-xs tabular-nums ${TONE_CLASS[d.tone]}`} data-testid={`delta-${d.key}`}>
              {d.direction === 'flat' ? '→ без изменений' : `${ARROW[d.direction]} ${formatDiff(m.format, d.diff, currency)}`}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
