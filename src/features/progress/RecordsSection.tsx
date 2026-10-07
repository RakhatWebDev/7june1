import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { db } from '../../db'
import { kg } from '../../lib/format'
import { Card, EmptyState } from '../../components/ui'
import { personalRecords } from './calc'
import { longDate } from './chartTheme'

export function RecordsSection() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  if (!sessions) return null
  const records = personalRecords(sessions)

  if (records.length === 0) {
    return (
      <EmptyState
        title="Рекордов пока нет"
        hint="Отмечайте рабочие подходы «готово» в тренировке — лучшие результаты появятся здесь."
      />
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Расчётный 1ПМ по формуле Эпли: вес × (1 + повторы / 30). Разминка не учитывается.</p>
      <ul className="space-y-2">
        {records.map((r) => (
          <Card as="li" key={r.exerciseId}>
            <Link to={`/workouts/exercises/${encodeURIComponent(r.exerciseId)}`} className="font-medium hover:text-accent">
              {r.name}
            </Link>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted">Макс. вес</div>
                <div className="font-semibold">
                  {kg(r.maxWeightKg)} × {r.maxWeightReps}
                </div>
                <div className="text-xs text-muted">{longDate(r.maxWeightDate)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Лучший 1ПМ</div>
                <div className="font-semibold text-accent">{kg(r.best1RM)}</div>
                <div className="text-xs text-muted">{longDate(r.best1RMDate)}</div>
              </div>
            </div>
          </Card>
        ))}
      </ul>
    </div>
  )
}
