import { useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { Button, Card, Chip, EmptyState, LinkButton, PageHeader, Sheet, Skeleton, Toast } from '../../components/ui'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { WorkoutSession } from '../../db/types'
import { int, plural } from '../../lib/format'
import { addExercise, finishSession, removeExercise, setHideMedia } from './actions'
import { formatClock, lastPerformance, newRecords, occurrenceIndex, sessionVolume } from './calc'
import { ConfirmSheet } from './ConfirmSheet'
import { ExercisePickerSheet } from './ExercisePickerSheet'
import { useExerciseMap, useHideMedia, useNow, useSession, useSessions } from './hooks'
import { formatSessionDateTime } from './labels'
import { RestTimer } from './RestTimer'
import { sessionCycleLabel } from './schedule'
import { SessionExerciseCard } from './SessionExerciseCard'
import { SessionSummary } from './SessionSummary'

const DEFAULT_REST_SEC = 90

/** /workouts/session/:id — log sets of an active session, or review/edit a finished one. */
export function SessionPage() {
  const { id = '' } = useParams()
  const session = useSession(id)
  const sessions = useSessions()

  if (session === undefined)
    return (
      <>
        <PageHeader title="Тренировка" back="/workouts" />
        <Skeleton className="mb-4 h-14" rounded="rounded-2xl" />
        <Skeleton className="h-72" rounded="rounded-3xl" />
      </>
    )
  if (session === null)
    return (
      <>
        <PageHeader title="Тренировка" back="/workouts" />
        <EmptyState icon="dumbbell" title="Тренировка не найдена" hint="Возможно, она была удалена." />
      </>
    )
  return <SessionView session={session} allSessions={sessions ?? []} />
}

function SessionView({ session, allSessions }: { session: WorkoutSession; allSessions: WorkoutSession[] }) {
  const { map } = useExerciseMap()
  const hideMedia = useHideMedia() ?? false
  const [rest, setRest] = useState<{ sec: number; key: number } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [removeIdx, setRemoveIdx] = useState<number | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [prCount, setPrCount] = useState(0)
  const isActive = !session.finishedAt
  const program = useLiveQuery(
    async () => (session.programId ? ((await db.programs.get(session.programId)) ?? null) : null),
    [session.programId],
  )
  const cycle = sessionCycleLabel(program ?? undefined, session)

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
    const records = newRecords(session, allSessions).length
    await finishSession(session.id)
    setRest(null)
    setSummaryOpen(true)
    setPrCount(records)
  }

  const exCount = session.exercises.length

  return (
    <>
      <PageHeader
        title={session.name}
        eyebrow={isActive ? 'Идёт тренировка' : undefined}
        subtitle={
          isActive
            ? cycle
            : [cycle, `Завершена · ${formatSessionDateTime(session.startedAt)}`].filter(Boolean).join(' · ')
        }
        back={isActive ? '/workouts' : '/workouts/history'}
        action={
          isActive ? undefined : (
            <LinkButton to="/workouts/history" variant="secondary" size="sm" icon="history">
              История
            </LinkButton>
          )
        }
      />
      {isActive ? (
        <ActiveBar session={session} onFinish={() => setConfirmFinish(true)} />
      ) : (
        <Card variant="elevated" className="mb-4">
          <SessionSummary session={session} allSessions={allSessions} />
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            Режим просмотра: подходы можно редактировать.
          </p>
        </Card>
      )}

      <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
        <p className="text-sm text-muted tabular-nums">
          {exCount} {plural(exCount, ['упражнение', 'упражнения', 'упражнений'])}
        </p>
        <Chip active={hideMedia} icon={hideMedia ? 'check' : undefined} onClick={() => void setHideMedia(!hideMedia)}>
          Скрывать технику
        </Chip>
      </div>

      {session.exercises.length === 0 && (
        <EmptyState icon="dumbbell" title="В тренировке нет упражнений" hint="Добавьте упражнение из библиотеки." />
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
            hideMedia={hideMedia}
            onSetDone={onSetDone}
            onRemove={() => setRemoveIdx(i)}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        <Button variant="secondary" icon="plus" onClick={() => setPickerOpen(true)}>
          Добавить упражнение
        </Button>
        {isActive && (
          <Button size="lg" icon="check" onClick={() => setConfirmFinish(true)}>
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
      <Sheet open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Тренировка завершена">
        <SessionSummary session={session} allSessions={allSessions} showNext />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <LinkButton to="/workouts/history" icon="history">
            К истории
          </LinkButton>
          <Button variant="secondary" onClick={() => setSummaryOpen(false)}>
            Закрыть
          </Button>
        </div>
      </Sheet>
      <Toast open={prCount > 0} icon="trophy" tone="amber" onClose={() => setPrCount(0)}>
        Новый рекорд{prCount > 1 ? ` ×${prCount}` : ''}
      </Toast>

      {rest && (
        <>
          {/* keeps the last set reachable above the fixed timer */}
          <div className="h-24" aria-hidden />
          <RestTimer key={rest.key} durationSec={rest.sec} onClose={() => setRest(null)} />
        </>
      )}
    </>
  )
}

/** Compact sticky bar of an active session: elapsed time, volume, sets and the finish button. */
function ActiveBar({ session, onFinish }: { session: WorkoutSession; onFinish: () => void }) {
  const now = useNow(1000)
  const elapsedSec = (now.getTime() - Date.parse(session.startedAt)) / 1000
  const sets = session.exercises.flatMap((e) => e.sets)
  const done = sets.filter((s) => s.done).length
  return (
    <div className="sticky top-[calc(var(--safe-top)+8px)] z-30 mb-4">
      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-surface-2/85 py-2 pr-2 pl-3.5 shadow-[var(--shadow-float)] backdrop-blur-xl">
        <BarStat label="Время">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/70 motion-reduce:animate-none" />
              <span className="relative size-2 rounded-full bg-accent" />
            </span>
            {formatClock(elapsedSec)}
          </span>
        </BarStat>
        <BarStat label="Объём">{int(sessionVolume(session))} кг</BarStat>
        <BarStat label="Подходы">
          {done}/{sets.length}
        </BarStat>
        <Button size="sm" className="ml-auto shrink-0" onClick={onFinish}>
          Завершить
        </Button>
      </div>
    </div>
  )
}

function BarStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="truncate text-[15px] leading-tight font-semibold tabular-nums">{children}</div>
    </div>
  )
}
