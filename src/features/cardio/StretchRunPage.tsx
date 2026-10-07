import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ExerciseMedia } from '../../components/ExerciseMedia'
import { Button, Card, EmptyState, PageHeader, Progress } from '../../components/ui'
import { useExercise } from '../../data/exercises'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import { estimateKcal } from './calc'
import { getRoutine, type StretchRoutine } from './stretchRoutines'
import { elapsedToMinutes, formatClock, initRunner, performedExerciseIds, runnerReducer } from './stretchRunner'
import { useBodyWeight } from './useBodyWeight'

export function StretchRunPage() {
  const { id } = useParams()
  const routine = getRoutine(id)
  if (!routine) {
    return (
      <>
        <PageHeader title="Растяжка" back="/cardio/stretch" />
        <EmptyState title="Комплекс не найден" action={<Link to="/cardio/stretch" className="text-accent">К списку комплексов</Link>} />
      </>
    )
  }
  return <StretchRunner key={routine.id} routine={routine} />
}

function StretchRunner({ routine }: { routine: StretchRoutine }) {
  const steps = routine.steps
  const reducer = useMemo(() => runnerReducer(steps), [steps])
  const [state, dispatch] = useReducer(reducer, steps, initRunner)
  const step = steps[state.index]
  const { exercise } = useExercise(step?.exerciseId)
  const weightKg = useBodyWeight()
  const [savedMin, setSavedMin] = useState<number | null>(null)
  const savedRef = useRef(false)

  // One-second ticker while running.
  useEffect(() => {
    if (!state.running || state.done) return
    const t = setInterval(() => dispatch({ type: 'tick' }), 1000)
    return () => clearInterval(t)
  }, [state.running, state.done])

  // Short buzz on every side/step change (when supported).
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(200)
  }, [state.index, state.side, state.done])

  // Persist the session once it is finished.
  useEffect(() => {
    if (!state.done || savedRef.current) return
    savedRef.current = true
    // Finished before doing anything — nothing worth logging.
    if (state.elapsed === 0 && state.reached === 0) return
    const durationMin = elapsedToMinutes(state.elapsed)
    const kcal = estimateKcal('stretch', durationMin, weightKg)
    void db.activities
      .add({
        id: newId(),
        type: 'stretch',
        date: today(),
        startedAt: new Date(Date.now() - state.elapsed * 1000).toISOString(),
        durationMin,
        exerciseIds: performedExerciseIds(steps, state.reached),
        ...(kcal != null ? { kcal } : {}),
        notes: routine.name,
      })
      .then(() => setSavedMin(durationMin))
  }, [state.done, state.elapsed, state.reached, steps, routine.name, weightKg])

  if (state.done) {
    const nothingDone = state.elapsed === 0 && state.reached === 0
    return (
      <>
        <PageHeader title={routine.name} back="/cardio/stretch" />
        <Card className="text-center">
          <div className="text-4xl" aria-hidden>
            🧘
          </div>
          <h2 className="mt-2 text-xl font-semibold">Комплекс завершён</h2>
          <p className="mt-1 text-sm text-muted">
            {nothingDone
              ? 'Ничего не выполнено — активность не сохранена'
              : savedMin == null
                ? 'Сохраняем…'
                : `Сохранено в активности: ${savedMin} мин растяжки`}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/cardio" className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg">
              К активностям
            </Link>
            <Link to="/cardio/stretch" className="rounded-xl bg-surface-2 px-4 py-2 text-sm">
              Другой комплекс
            </Link>
          </div>
        </Card>
      </>
    )
  }

  const progressLabel = `${state.index + 1}/${steps.length}`
  const total = step.holdSec
  const toggleLabel = state.running ? 'Пауза' : state.elapsed === 0 ? 'Старт' : 'Продолжить'
  return (
    <>
      <PageHeader title={routine.name} subtitle={`Упражнение ${progressLabel}`} back="/cardio/stretch" />
      <Progress value={state.index / steps.length} className="mb-4" />
      <Card className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{step.nameRu}</h2>
          <span className="shrink-0 text-sm text-muted" data-testid="stretch-progress">
            {progressLabel}
          </span>
        </div>
        {exercise ? (
          <ExerciseMedia exercise={exercise} />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-surface-2 text-muted">Загрузка…</div>
        )}
        {step.perSide && (
          <p className="text-center text-sm font-medium text-accent">
            {state.side === 0 ? 'Первая сторона' : 'Вторая сторона'}
          </p>
        )}
        <div
          className="text-center text-6xl font-bold tabular-nums"
          role="timer"
          aria-live="off"
          aria-label="Осталось"
        >
          {formatClock(state.remaining)}
        </div>
        <Progress value={(total - state.remaining) / total} />
        {exercise && exercise.instructions.length > 0 && (
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">Как выполнять (англ.)</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {exercise.instructions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </details>
        )}
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          size="lg"
          variant={state.running ? 'secondary' : 'primary'}
          aria-label={`Таймер: ${toggleLabel}`}
          onClick={() => dispatch({ type: 'toggle' })}
        >
          {toggleLabel}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => dispatch({ type: 'next' })}>
          Далее
        </Button>
      </div>
      <Button variant="ghost" className="mt-2 w-full" onClick={() => dispatch({ type: 'finish' })}>
        Завершить сейчас
      </Button>
    </>
  )
}
