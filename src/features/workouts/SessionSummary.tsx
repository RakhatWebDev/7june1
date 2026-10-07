import { Stat } from '../../components/ui'
import type { WorkoutSession } from '../../db/types'
import { formatMinutes } from '../../lib/dates'
import { int } from '../../lib/format'
import { doneSetCount, fmtKg, newRecords, sessionDurationMin, sessionVolume } from './calc'

/** Totals of a session: duration, volume, sets and new personal records. */
export function SessionSummary({ session, allSessions }: { session: WorkoutSession; allSessions: WorkoutSession[] }) {
  const records = newRecords(session, allSessions)
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Длительность" value={formatMinutes(sessionDurationMin(session))} />
        <Stat label="Объём" value={`${int(sessionVolume(session))} кг`} />
        <Stat label="Подходы" value={doneSetCount(session)} />
      </div>
      <div className="mt-3">
        <h3 className="text-sm font-semibold">Новые рекорды</h3>
        {records.length === 0 ? (
          <p className="text-sm text-muted">В этот раз без новых рекордов.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {records.map((r) => (
              <li key={r.exerciseId}>
                <span className="text-accent">🏆 {r.name}</span>
                {r.weightKg && (
                  <span>
                    {' '}
                    · вес {fmtKg(r.weightKg.value)} кг <span className="text-muted">(было {fmtKg(r.weightKg.prev)})</span>
                  </span>
                )}
                {r.oneRM && (
                  <span>
                    {' '}
                    · 1RM {fmtKg(Math.round(r.oneRM.value * 10) / 10)} кг{' '}
                    <span className="text-muted">(было {fmtKg(Math.round(r.oneRM.prev * 10) / 10)})</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
