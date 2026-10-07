import { useState } from 'react'
import { Link } from 'react-router'
import { Card, EmptyState, PageHeader } from '../../components/ui'
import type { WorkoutSession } from '../../db/types'
import { formatMinutes } from '../../lib/dates'
import { int, plural } from '../../lib/format'
import { deleteSession } from './actions'
import { doneSetCount, sessionDurationMin, sessionVolume } from './calc'
import { ConfirmSheet } from './ConfirmSheet'
import { useSessions } from './hooks'
import { formatSessionDate } from './labels'
import { secondaryLink } from './linkStyles'

/** /workouts/history — sessions newest first, grouped by day, with delete. */
export function HistoryPage() {
  const sessions = useSessions()
  const [toDelete, setToDelete] = useState<WorkoutSession | null>(null)

  return (
    <>
      <PageHeader title="История" subtitle={sessions ? `${sessions.length} ${plural(sessions.length, ['тренировка', 'тренировки', 'тренировок'])}` : undefined} back="/workouts" />
      {sessions && sessions.length === 0 && (
        <EmptyState
          title="Тренировок пока нет"
          hint="Начните тренировку из программы — она появится здесь."
          action={
            <Link to="/workouts" className={secondaryLink}>
              К программам
            </Link>
          }
        />
      )}
      <ul className="space-y-2">
        {sessions?.map((s, i) => {
          const day = formatSessionDate(s.startedAt)
          const showDay = i === 0 || formatSessionDate(sessions[i - 1].startedAt) !== day
          return (
            <li key={s.id}>
              {showDay && <h2 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{day}</h2>}
              <Card as="div" className="flex items-center gap-2 p-0">
                <Link to={`/workouts/session/${s.id}`} className="min-w-0 flex-1 p-4 hover:text-accent">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{s.name}</span>
                    {!s.finishedAt && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">Идёт</span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {formatMinutes(sessionDurationMin(s))} · {int(sessionVolume(s))} кг · {doneSetCount(s)}{' '}
                    {plural(doneSetCount(s), ['подход', 'подхода', 'подходов'])}
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label={`Удалить тренировку ${s.name}`}
                  className="mr-2 shrink-0 rounded-lg px-3 py-2 text-muted hover:bg-danger/15 hover:text-danger"
                  onClick={() => setToDelete(s)}
                >
                  ✕
                </button>
              </Card>
            </li>
          )
        })}
      </ul>
      <ConfirmSheet
        open={toDelete !== null}
        title="Удалить тренировку?"
        text={toDelete ? `«${toDelete.name}» будет удалена без возможности восстановления.` : undefined}
        onConfirm={() => toDelete && void deleteSession(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </>
  )
}
