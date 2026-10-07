import { IconBadge, Stat } from '../../components/ui'
import type { WorkoutSession } from '../../db/types'
import { formatMinutes } from '../../lib/dates'
import { int } from '../../lib/format'
import { doneSetCount, fmtKg, newRecords, sessionDurationMin, sessionVolume } from './calc'

/** Totals of a session: duration, volume, sets and new personal records (highlighted rows). */
export function SessionSummary({ session, allSessions }: { session: WorkoutSession; allSessions: WorkoutSession[] }) {
  const records = newRecords(session, allSessions)
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Stat icon="timer" tone="accent" label="Время" value={formatMinutes(sessionDurationMin(session))} />
        <Stat icon="dumbbell" tone="accent" label="Объём" value={`${int(sessionVolume(session))} кг`} />
        <Stat icon="check" tone="accent" label="Подходы" value={doneSetCount(session)} />
      </div>
      <div className="mt-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight">Новые рекорды</h3>
        {records.length === 0 ? (
          <p className="text-sm text-muted">В этот раз без новых рекордов.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {records.map((r) => (
              <li
                key={r.exerciseId}
                className="flex items-start gap-3 rounded-2xl border border-amber/30 bg-amber/10 p-3"
                data-testid="pr-row"
              >
                <IconBadge name="trophy" tone="amber" size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-amber">{r.name}</p>
                  {r.weightKg && (
                    <p className="tabular-nums">
                      вес {fmtKg(r.weightKg.value)} кг <span className="text-muted">(было {fmtKg(r.weightKg.prev)})</span>
                    </p>
                  )}
                  {r.oneRM && (
                    <p className="tabular-nums">
                      1RM {fmtKg(Math.round(r.oneRM.value * 10) / 10)} кг{' '}
                      <span className="text-muted">(было {fmtKg(Math.round(r.oneRM.prev * 10) / 10)})</span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
