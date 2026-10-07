import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { motion } from 'motion/react'
import { ExerciseMedia } from '../../components/ExerciseMedia'
import {
  Button,
  Card,
  Confetti,
  EmptyState,
  IconBadge,
  LinkButton,
  PageHeader,
  Progress,
  Ring,
  Skeleton,
} from '../../components/ui'
import { Icon } from '../../components/icons'
import { useReduceMotion } from '../../components/ui/helpers'
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
        <EmptyState
          icon="stretch"
          tone="violet"
          title="Комплекс не найден"
          action={
            <LinkButton to="/cardio/stretch" variant="secondary" icon="list">
              К списку комплексов
            </LinkButton>
          }
        />
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
  const reduce = useReduceMotion()

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
        <Card variant="elevated" tone="violet" className="relative overflow-hidden py-8 text-center">
          {!nothingDone && <Confetti />}
          <motion.div
            className="mx-auto w-fit"
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            <IconBadge name={nothingDone ? 'stretch' : 'check'} tone="violet" size="lg" className="size-16 rounded-3xl" />
          </motion.div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">Комплекс завершён</h2>
          <p className="mt-1 text-sm text-muted">
            {nothingDone
              ? 'Ничего не выполнено — активность не сохранена'
              : savedMin == null
                ? 'Сохраняем…'
                : `Сохранено в активности: ${savedMin} мин растяжки`}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <LinkButton to="/cardio" icon="activity">
              К активностям
            </LinkButton>
            <LinkButton to="/cardio/stretch" variant="secondary">
              Другой комплекс
            </LinkButton>
          </div>
        </Card>
      </>
    )
  }

  const progressLabel = `${state.index + 1}/${steps.length}`
  const total = step.holdSec
  const toggleLabel = state.running ? 'Пауза' : state.elapsed === 0 ? 'Старт' : 'Продолжить'
  const phase = state.running ? 'Держите' : state.elapsed === 0 ? 'Готовы?' : 'Пауза'
  const warning = state.running && state.remaining <= 5
  const springIn = { type: 'spring', stiffness: 300, damping: 26 } as const
  return (
    <>
      <PageHeader title={routine.name} subtitle={`Упражнение ${progressLabel}`} back="/cardio/stretch" />
      <Progress value={state.index / steps.length} tone="violet" className="mb-4" aria-label="Прогресс комплекса" />
      <Card className="overflow-hidden">
        <motion.div
          key={state.index}
          className="space-y-3"
          initial={reduce ? false : { x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={springIn}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <IconBadge name="stretch" tone="violet" />
              <h2 className="text-lg leading-snug font-semibold tracking-tight">{step.nameRu}</h2>
            </div>
            <span
              className="mt-1 shrink-0 rounded-full bg-violet/15 px-2.5 py-0.5 text-xs font-semibold text-violet tabular-nums"
              data-testid="stretch-progress"
            >
              {progressLabel}
            </span>
          </div>
          {exercise ? (
            <div className="mx-auto w-full max-w-[280px]">
              <ExerciseMedia exercise={exercise} className="max-h-[200px]" />
            </div>
          ) : (
            <Skeleton className="mx-auto aspect-[4/3] w-full max-w-[280px]" rounded="rounded-2xl" />
          )}
        </motion.div>

        <motion.div
          key={`${state.index}-${state.side}`}
          className="mt-4 flex flex-col items-center"
          initial={reduce ? false : { scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springIn}
        >
          <div className={warning ? 'animate-pulse-soft' : ''}>
            <Ring value={total > 0 ? state.remaining / total : 0} size={184} stroke={12} tone="violet">
              <div className="flex flex-col items-center">
                <span className="text-xs font-medium tracking-wide text-muted uppercase">{phase}</span>
                <div
                  className="text-[52px] leading-none font-bold tracking-tight tabular-nums"
                  role="timer"
                  aria-live="off"
                  aria-label="Осталось"
                >
                  {formatClock(state.remaining)}
                </div>
                {step.perSide ? (
                  <span className="mt-1.5 rounded-full bg-violet/15 px-2.5 py-0.5 text-xs font-semibold text-violet">
                    {state.side === 0 ? 'Первая сторона' : 'Вторая сторона'}
                  </span>
                ) : (
                  <span className="mt-1.5 text-xs text-muted">из {formatClock(total)}</span>
                )}
              </div>
            </Ring>
          </div>
        </motion.div>

        {exercise && exercise.instructions.length > 0 && (
          <details className="group mt-4 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-text marker:hidden">
              Как выполнять (англ.)
              <Icon name="chevron-down" size={18} className="text-muted transition-transform group-open:rotate-180" />
            </summary>
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
          icon={state.running ? 'pause' : 'play'}
          aria-label={`Таймер: ${toggleLabel}`}
          onClick={() => dispatch({ type: 'toggle' })}
        >
          {toggleLabel}
        </Button>
        <Button size="lg" variant="secondary" iconRight="chevron-right" onClick={() => dispatch({ type: 'next' })}>
          Далее
        </Button>
      </div>
      <Button variant="ghost" icon="check" className="mt-2 w-full" onClick={() => dispatch({ type: 'finish' })}>
        Завершить сейчас
      </Button>
    </>
  )
}
