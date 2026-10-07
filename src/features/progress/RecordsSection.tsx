import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { db } from '../../db'
import { kg } from '../../lib/format'
import { Card, EmptyState, Icon, IconBadge, StaggerList } from '../../components/ui'
import { personalRecords } from './calc'
import { longDate } from './chartTheme'

export function RecordsSection() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  if (!sessions) return null
  const records = personalRecords(sessions)

  if (records.length === 0) {
    return (
      <EmptyState
        icon="trophy"
        tone="amber"
        title="Рекордов пока нет"
        hint="Отмечайте рабочие подходы «готово» в тренировке — лучшие результаты появятся здесь."
      />
    )
  }

  return (
    <div>
      <p className="mb-3 flex items-start gap-1.5 px-0.5 text-xs text-muted">
        <Icon name="info" size={14} className="mt-px shrink-0" />
        <span>
          Расчётный 1ПМ по формуле Эпли: вес × (1 + повторы / 30). Разминка не учитывается.
        </span>
      </p>
      <StaggerList as="ul" className="space-y-3">
        {records.map((r) => (
          <Card as="div" key={r.exerciseId}>
            <Link
              to={`/workouts/exercises/${encodeURIComponent(r.exerciseId)}`}
              className="group flex items-center gap-3"
            >
              <IconBadge name="trophy" tone="amber" />
              <span className="min-w-0 flex-1 truncate font-semibold tracking-tight transition-colors group-hover:text-accent">
                {r.name}
              </span>
              <Icon name="chevron-right" size={16} className="text-muted" />
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-surface-2/70 p-3">
                <div className="flex items-center gap-1 text-xs text-muted">
                  <Icon name="dumbbell" size={13} />
                  Макс. вес
                </div>
                <div className="mt-1 text-lg font-semibold tracking-tight tabular-nums">
                  {kg(r.maxWeightKg)} × {r.maxWeightReps}
                </div>
                <div className="text-[11px] text-muted tabular-nums">
                  {longDate(r.maxWeightDate)}
                </div>
              </div>
              <div className="rounded-2xl bg-accent/10 p-3 ring-1 ring-accent/20">
                <div className="flex items-center gap-1 text-xs text-muted">
                  <Icon name="star" size={13} className="text-accent" />
                  Лучший 1ПМ
                </div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-accent tabular-nums">
                  {kg(r.best1RM)}
                </div>
                <div className="text-[11px] text-muted tabular-nums">{longDate(r.best1RMDate)}</div>
              </div>
            </div>
          </Card>
        ))}
      </StaggerList>
    </div>
  )
}
