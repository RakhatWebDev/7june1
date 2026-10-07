import { Link } from 'react-router'
import { motion } from 'motion/react'
import type { LifeGoal } from '../../db/types'
import { CountUp, Icon, IconBadge, Progress, StatTile, type IconName, type Tone } from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import { areaMeta, GOAL_STATUS_RU } from './areas'
import { goalProgress, weekDeltas } from './calc'
import { formatDiff, formatMetric, METRICS, type MetricFormat } from './metrics'
import { longDate, staggerItem, TONE_CLASS } from './styles'

/** Read-only star rating (amber stars). */
export function Stars({
  value,
  className = '',
  size = 14,
}: {
  value: number | undefined
  className?: string
  size?: number
}) {
  const v = Math.max(0, Math.min(5, Math.round(value ?? 0)))
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`Оценка ${v} из 5`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star"
          size={size}
          fill={n <= v ? 'currentColor' : 'none'}
          className={n <= v ? 'text-amber' : 'text-surface-3'}
        />
      ))}
    </span>
  )
}

/** Tap-to-rate 1–5 stars; filled stars pop with a staggered spring. */
export function RatingInput({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void
}) {
  const reduce = useReduceMotion()
  return (
    <div className="flex gap-1" role="group" aria-label="Оценка недели">
      {([1, 2, 3, 4, 5] as const).map((n) => {
        const on = value != null && n <= value
        return (
          <motion.button
            key={n}
            type="button"
            aria-label={`Оценка ${n}`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            whileTap={reduce ? undefined : { scale: 0.8 }}
            animate={reduce ? undefined : { scale: on ? 1.12 : 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 14, delay: on ? (n - 1) * 0.04 : 0 }}
            className={`grid size-11 place-items-center rounded-xl transition-colors ${
              on ? 'text-amber' : 'text-surface-3 hover:text-muted'
            }`}
          >
            <Icon name="star" size={28} fill={on ? 'currentColor' : 'none'} strokeWidth={on ? 1.5 : 1.75} />
          </motion.button>
        )
      })}
    </div>
  )
}

/** Goal card linking to its edit page: area badge, title, KR summary and progress in the area tone. */
export function GoalRow({ goal }: { goal: LifeGoal }) {
  const pct = Math.round(goalProgress(goal))
  const area = areaMeta(goal.area)
  return (
    <Link
      to={`/goals/${goal.id}`}
      className="block rounded-3xl border border-white/[0.06] bg-surface bg-[image:var(--gradient-surface)] p-4 shadow-[var(--shadow-card)] transition-[border-color,transform] duration-150 hover:border-white/15 active:scale-[0.99] motion-reduce:active:scale-100"
    >
      <div className="flex items-start gap-3">
        <IconBadge name={area.iconName} tone={area.tone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate font-semibold tracking-tight">{goal.title}</h3>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{pct}%</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {goal.status !== 'active' && <span className="mr-2">{GOAL_STATUS_RU[goal.status]}</span>}
            {goal.keyResults.length > 0 ? `${goal.keyResults.length} KR` : 'Без ключевых результатов'}
            {goal.deadline && ` · до ${longDate(goal.deadline)}`}
          </p>
          <Progress value={pct / 100} tone={area.tone} className="mt-2.5 h-1.5" aria-label={`${goal.title}: ${pct}%`} />
        </div>
      </div>
    </Link>
  )
}

const ARROW = { up: '↑', down: '↓', flat: '→' } as const

/** Icon + tone of each weekly metric (domain colours). */
const METRIC_BADGE: Record<string, { icon: IconName; tone: Tone }> = {
  workouts: { icon: 'dumbbell', tone: 'accent' },
  workoutVolumeKg: { icon: 'chart', tone: 'accent' },
  cardioMin: { icon: 'run', tone: 'info' },
  cardioKm: { icon: 'activity', tone: 'info' },
  stretchMin: { icon: 'stretch', tone: 'info' },
  avgSleepMin: { icon: 'moon', tone: 'violet' },
  sleepNights: { icon: 'moon', tone: 'violet' },
  avgKcal: { icon: 'flame', tone: 'warn' },
  kcalTarget: { icon: 'target', tone: 'warn' },
  daysOnKcal: { icon: 'utensils', tone: 'warn' },
  waterAvgMl: { icon: 'droplet', tone: 'info' },
  habitsPct: { icon: 'check', tone: 'pink' },
  pagesRead: { icon: 'book', tone: 'amber' },
  readingMin: { icon: 'timer', tone: 'amber' },
  moodAvg: { icon: 'heart', tone: 'violet' },
  mindMin: { icon: 'brain', tone: 'violet' },
  gratitudeDays: { icon: 'sparkles', tone: 'pink' },
  spent: { icon: 'wallet', tone: 'amber' },
  income: { icon: 'wallet', tone: 'accent' },
  budgetPct: { icon: 'chart', tone: 'amber' },
  weightStart: { icon: 'scale', tone: 'accent' },
  weightEnd: { icon: 'scale', tone: 'accent' },
  calendarEvents: { icon: 'calendar', tone: 'info' },
}

/** Decimal places shown while a metric counts up (whole numbers except kg/km/score). */
const DIGITS: Partial<Record<MetricFormat, number>> = { kg: 1, km: 1, score: 1 }

/**
 * Grid of weekly metric tiles with the change against the previous week (coloured ↑↓).
 * Values count up on mount. Metrics that are zero in both weeks are hidden unless `showAll`.
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
  const reduce = useReduceMotion()
  const deltas = weekDeltas(current, previous).filter((d) => showAll || d.current !== 0 || d.previous !== 0)
  if (deltas.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted">
        За эту неделю пока нет данных.
      </p>
    )
  }
  const meta = new Map(METRICS.map((m) => [m.key, m]))
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Цифры недели">
      {deltas.map((d, i) => {
        const m = meta.get(d.key)!
        const badge = METRIC_BADGE[d.key] ?? { icon: 'chart', tone: 'muted' }
        const digits = DIGITS[m.format] ?? 0
        return (
          <motion.li key={d.key} {...staggerItem(i, reduce)}>
            <StatTile
              className="h-full"
              data-testid={`stat-${d.key}`}
              icon={badge.icon}
              tone={badge.tone}
              label={m.label}
              value={
                <CountUp
                  value={d.current}
                  delay={Math.min(i, 9) * 0.04}
                  format={(n) =>
                    formatMetric(m.format, n === d.current ? n : Number(n.toFixed(digits)), currency)
                  }
                />
              }
              sub={
                <span
                  className={`font-medium tabular-nums ${TONE_CLASS[d.tone]}`}
                  data-testid={`delta-${d.key}`}
                >
                  {d.direction === 'flat'
                    ? '→ без изменений'
                    : `${ARROW[d.direction]} ${formatDiff(m.format, d.diff, currency)}`}
                </span>
              }
            />
          </motion.li>
        )
      })}
    </ul>
  )
}
