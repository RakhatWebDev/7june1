import { useLiveQuery } from 'dexie-react-hooks'
import { Button, IconBadge, Stat } from '../../components/ui'
import { Icon } from '../../components/icons'
import { db } from '../../db'
import type { WorkoutSession } from '../../db/types'
import { getMaxes, getTrainingMaxes, saveMax } from '../../data/programs/maxes'
import { formatMinutes } from '../../lib/dates'
import { int } from '../../lib/format'
import { maxUpdateSuggestions, nextTimePreview, TREND_ARROW } from './autoreg'
import { doneSetCount, fmtKg, newRecords, sessionDurationMin, sessionVolume } from './calc'
import { useExerciseMap } from './hooks'
import { SessionReviewCard } from '../coach/cards'

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * Totals of a session: duration, volume, sets and new personal records (highlighted rows);
 * a prompt to save a new tested max after MAX / heavy-single sets and, right after finishing
 * (`showNext`), the auto-regulated weights for next time.
 */
export function SessionSummary({
  session,
  allSessions,
  showNext = false,
}: {
  session: WorkoutSession
  allSessions: WorkoutSession[]
  showNext?: boolean
}) {
  const records = newRecords(session, allSessions)
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Stat icon="timer" tone="accent" label="Время" value={formatMinutes(sessionDurationMin(session))} />
        <Stat icon="dumbbell" tone="accent" label="Объём" value={`${int(sessionVolume(session))} кг`} />
        <Stat icon="check" tone="accent" label="Подходы" value={doneSetCount(session)} />
      </div>
      <MaxPrompts session={session} allSessions={allSessions} showNext={showNext} />
      <div className="mt-4">
        <SessionReviewCard sessionId={session.id} />
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
                      вес {fmtKg(r.weightKg.value)} кг{' '}
                      <span className="text-muted">(было {fmtKg(r.weightKg.prev)})</span>
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

/** «Новый максимум: присед 65 кг — сохранить?» and «Следующий раз: …» for program sessions. */
function MaxPrompts({
  session,
  allSessions,
  showNext,
}: {
  session: WorkoutSession
  allSessions: WorkoutSession[]
  showNext: boolean
}) {
  const { map } = useExerciseMap()
  const data = useLiveQuery(async () => {
    const [program, maxes, trainingMaxes] = await Promise.all([
      session.programId ? db.programs.get(session.programId) : Promise.resolve(undefined),
      getMaxes(db),
      getTrainingMaxes(db),
    ])
    return { program, maxes, trainingMaxes }
  }, [session.programId])
  if (!data) return null
  const suggestions = maxUpdateSuggestions(session, data.program, data.maxes)
  const next = showNext ? nextTimePreview(session, allSessions, data.program, data.maxes, data.trainingMaxes, map) : []
  if (suggestions.length === 0 && next.length === 0) return null
  return (
    <div className="mt-4 space-y-2">
      {suggestions.map((s) => (
        <div
          key={s.liftId}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-accent/30 bg-accent/10 p-3 text-sm"
          data-testid="max-suggestion"
        >
          <Icon name="trophy" size={18} className="shrink-0 text-accent" />
          <p className="min-w-0 flex-1 tabular-nums">
            Новый максимум: {lowerFirst(s.label)} {fmtKg(s.kg)} кг — сохранить?
            {s.prev != null && <span className="text-muted"> (было {fmtKg(s.prev)})</span>}
          </p>
          <Button size="sm" onClick={() => void saveMax(db, s.liftId, s.kg, 'raise')}>
            Сохранить
          </Button>
        </div>
      ))}
      {next.length > 0 && (
        <p className="rounded-2xl bg-surface-2 p-3 text-sm tabular-nums" data-testid="next-time">
          <span className="text-muted">Следующий раз: </span>
          {next.map((n) => `${lowerFirst(n.name)} ${fmtKg(n.kg)} кг (${TREND_ARROW[n.trend]})`).join(', ')}
        </p>
      )}
    </div>
  )
}
