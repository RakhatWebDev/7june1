import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button, EmptyState, PageHeader, Sheet } from '../../components/ui'
import type { WorkoutSession } from '../../db/types'
import { addExercise, finishSession, removeExercise } from './actions'
import { formatClock, lastPerformance, occurrenceIndex, sessionVolume } from './calc'
import { ConfirmSheet } from './ConfirmSheet'
import { ExercisePickerSheet } from './ExercisePickerSheet'
import { useExerciseMap, useNow, useSession, useSessions } from './hooks'
import { formatSessionDateTime } from './labels'
import { primaryLink, secondaryLink } from './linkStyles'
import { RestTimer } from './RestTimer'
import { SessionExerciseCard } from './SessionExerciseCard'
import { SessionSummary } from './SessionSummary'
import { int } from '../../lib/format'

const DEFAULT_REST_SEC = 90

/** /workouts/session/:id — log sets of an active session, or review/edit a finished one. */
export function SessionPage() {
  const { id = '' } = useParams()
  const session = useSession(id)
  const sessions = useSessions()

  if (session === undefined) return <PageHeader title="Тренировка" back="/workouts" />
  if (session === null)
    return (
      <>
        <PageHeader title="Тренировка" back="/workouts" />
        <EmptyState title="Тренировка не найдена" hint="Возможно, она была удалена." />
      </>
    )
  return <SessionView session={session} allSessions={sessions ?? []} />
}

function SessionView({ session, allSessions }: { session: WorkoutSession; allSessions: WorkoutSession[] }) {
  const { map } = useExerciseMap()
  const [rest, setRest] = useState<{ sec: number; key: number } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [removeIdx, setRemoveIdx] = useState<number | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const isActive = !session.finishedAt

  const lasts = useMemo(
    () =>
      session.exercises.map((e, i) =>
        lastPerformance(allSessions, e.exerciseId, {
          excludeSessionId: session.id,
          occurrence: occurrenceIndex(session.exercises, i),
          before: session.startedAt,
        }),
      ),
    [allSessions, session],
  )

  const onSetDone = (restSec: number | undefined) => {
    if (!isActive) return
    setRest({ sec: restSec ?? DEFAULT_REST_SEC, key: Date.now() })
  }

  const finish = async () => {
    await finishSession(session.id)
    setRest(null)
    setSummaryOpen(true)
  }

  return (
    <>
      <PageHeader
        title={session.name}
        subtitle={isActive ? undefined : `Завершена · ${formatSessionDateTime(session.startedAt)}`}
        back={isActive ? '/workouts' : '/workouts/history'}
        action={
          isActive ? (
            <Button onClick={() => setConfirmFinish(true)}>Завершить</Button>
          ) : (
            <Link to="/workouts/history" className={secondaryLink}>
              История
            </Link>
          )
        }
      />
      {isActive ? (
        <ActiveBar session={session} />
      ) : (
        <div className="mb-4 rounded-2xl border border-border bg-surface p-4">
          <SessionSummary session={session} allSessions={allSessions} />
          <p className="mt-3 text-xs text-muted">Режим просмотра: подходы можно редактировать.</p>
        </div>
      )}

      {session.exercises.length === 0 && (
        <EmptyState title="В тренировке нет упражнений" hint="Добавьте упражнение из библиотеки." />
      )}
      <div className="space-y-3">
        {session.exercises.map((e, i) => (
          <SessionExerciseCard
            key={`${e.exerciseId}-${i}`}
            sessionId={session.id}
            exIdx={i}
            exercise={e}
            libraryExercise={map.get(e.exerciseId)}
            last={lasts[i]}
            onSetDone={onSetDone}
            onRemove={() => setRemoveIdx(i)}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        <Button variant="secondary" onClick={() => setPickerOpen(true)}>
          + Добавить упражнение
        </Button>
        {isActive && (
          <Button size="lg" onClick={() => setConfirmFinish(true)}>
            Завершить тренировку
          </Button>
        )}
      </div>

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(ex, name) => void addExercise(session.id, { exerciseId: ex.id, name })}
      />
      <ConfirmSheet
        open={removeIdx !== null}
        title="Удалить упражнение?"
        text={removeIdx !== null ? session.exercises[removeIdx]?.name : undefined}
        onConfirm={() => removeIdx !== null && void removeExercise(session.id, removeIdx)}
        onClose={() => setRemoveIdx(null)}
      />
      <ConfirmSheet
        open={confirmFinish}
        title="Завершить тренировку?"
        text="Невыполненные подходы останутся пустыми и не войдут в объём."
        confirmLabel="Завершить"
        onConfirm={() => void finish()}
        onClose={() => setConfirmFinish(false)}
      />
      <Sheet open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Тренировка завершена 💪">
        <SessionSummary session={session} allSessions={allSessions} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link to="/workouts/history" className={primaryLink}>
            К истории
          </Link>
          <Button variant="secondary" onClick={() => setSummaryOpen(false)}>
            Закрыть
          </Button>
        </div>
      </Sheet>

      {rest && <RestTimer key={rest.key} durationSec={rest.sec} onClose={() => setRest(null)} />}
    </>
  )
}

function ActiveBar({ session }: { session: WorkoutSession }) {
  const now = useNow(1000)
  const elapsedSec = (now.getTime() - Date.parse(session.startedAt)) / 1000
  return (
    <div className="mb-4 flex items-center justify-between rounded-2xl border border-accent/40 bg-surface px-4 py-2 text-sm">
      <span>
        <span className="text-muted">Идёт </span>
        <span className="font-semibold tabular-nums">{formatClock(elapsedSec)}</span>
      </span>
      <span>
        <span className="text-muted">Объём </span>
        <span className="font-semibold">{int(sessionVolume(session))} кг</span>
      </span>
    </div>
  )
}
