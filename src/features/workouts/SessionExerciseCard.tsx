import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Card } from '../../components/ui'
import { Icon } from '../../components/icons'
import { ExerciseMedia } from '../../components/ExerciseMedia'
import { exerciseImageUrl } from '../../data/exercises'
import type { Exercise, SessionExercise, SetLog } from '../../db/types'
import { addSet, applyPreviousWeights, removeSet, updateSet } from './actions'
import { formatPerformance, type PastPerformance } from './calc'
import { restLabel } from './labels'
import { ExerciseTechniqueSheet } from './ExerciseTechniqueSheet'
import { SetRow } from './SetRow'

/** One exercise inside a session: media, short instructions, plan, last time, sets. */
export function SessionExerciseCard({
  sessionId,
  exIdx,
  exercise,
  libraryExercise,
  last,
  hideMedia = false,
  onSetDone,
  onRemove,
}: {
  sessionId: string
  exIdx: number
  exercise: SessionExercise
  libraryExercise?: Exercise
  last: PastPerformance | null
  /** Show a small thumbnail instead of the inline animation */
  hideMedia?: boolean
  onSetDone: (restSec: number | undefined) => void
  onRemove: () => void
}) {
  const [techniqueOpen, setTechniqueOpen] = useState(false)
  const [showAllSteps, setShowAllSteps] = useState(false)
  const steps = libraryExercise?.instructions ?? []
  const visibleSteps = showAllSteps ? steps : steps.slice(0, 2)
  const doneCount = exercise.sets.filter((s) => s.done).length
  const allDone = exercise.sets.length > 0 && doneCount === exercise.sets.length

  const changeSet = (setIdx: number, patch: Partial<SetLog>) => {
    if (patch.done === true && !exercise.sets[setIdx]?.done) onSetDone(exercise.restSec)
    return updateSet(sessionId, exIdx, setIdx, patch)
  }

  return (
    <Card as="article" className={`p-3 transition-[border-color] duration-300 ${allDone ? 'border-accent/30' : ''}`}>
      <div className="flex items-start gap-3">
        {hideMedia && libraryExercise?.images[0] ? (
          <button
            type="button"
            aria-label={`Техника: ${exercise.name}`}
            className="size-14 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-white/10"
            onClick={() => setTechniqueOpen(true)}
          >
            <img
              src={exerciseImageUrl(libraryExercise.images[0])}
              alt=""
              loading="lazy"
              className="h-full w-full object-contain"
            />
          </button>
        ) : (
          <span
            aria-hidden
            className={`grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold tabular-nums transition-colors ${
              allDone ? 'bg-accent text-bg' : 'bg-accent/15 text-accent'
            }`}
          >
            {allDone ? <Icon name="check" size={18} strokeWidth={2.5} /> : exIdx + 1}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="leading-snug font-semibold tracking-tight">{exercise.name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted tabular-nums">
            <span>
              План: {exercise.targetSets} × {exercise.targetReps}
              {exercise.restSec ? ` · ${restLabel(exercise.restSec)}` : ''}
            </span>
            <span className={allDone ? 'text-accent' : ''}>
              · выполнено {doneCount}/{exercise.sets.length}
            </span>
          </p>
          {exercise.notes && <p className="mt-0.5 text-xs text-muted">{exercise.notes}</p>}
        </div>
        <Link
          to={`/workouts/exercises/${encodeURIComponent(exercise.exerciseId)}`}
          aria-label={`Подробнее: ${exercise.name}`}
          className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-accent"
        >
          <Icon name="info" size={19} />
        </Link>
      </div>

      {libraryExercise && !hideMedia && (
        <div className="relative mx-auto mt-3 w-full max-w-[260px]" data-testid="session-media">
          <ExerciseMedia exercise={libraryExercise} className="max-h-[180px]" />
          {/* Overlay (sibling, not nested — ExerciseMedia is itself a button) opens the big view */}
          <button
            type="button"
            aria-label={`Техника: ${exercise.name}`}
            className="absolute inset-0 rounded-2xl"
            onClick={() => setTechniqueOpen(true)}
          />
        </div>
      )}

      {visibleSteps.length > 0 && (
        <div className="mt-3 text-sm text-muted">
          <ol className="list-decimal space-y-1 pl-5 marker:text-muted/60">
            {visibleSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {steps.length > 2 && (
            <button
              type="button"
              className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-accent"
              onClick={() => setShowAllSteps((v) => !v)}
            >
              {showAllSteps ? 'Свернуть' : `Показать всё (${steps.length})`}
            </button>
          )}
        </div>
      )}

      {last && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-2xl bg-surface-2 py-2 pr-1.5 pl-3">
          <p className="flex min-w-0 items-center gap-1.5 text-sm tabular-nums">
            <Icon name="history" size={15} className="shrink-0 text-muted" />
            <span>
              <span className="text-muted">Прошлый раз: </span>
              {formatPerformance(last.sets)}
            </span>
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-accent hover:text-accent"
            onClick={() =>
              void applyPreviousWeights(
                sessionId,
                exIdx,
                last.sets.map((s) => s.weightKg),
              )
            }
          >
            Повторить прошлый вес
          </Button>
        </div>
      )}

      <div
        aria-hidden
        className="mt-3 flex gap-2 px-0 text-[11px] font-medium tracking-wide text-muted uppercase sm:gap-3"
      >
        <span className="hidden w-7 text-center sm:block">№</span>
        <span className="w-[138px] sm:w-[146px]">Вес, кг</span>
        <span className="w-[138px] sm:w-[146px]">Повторы</span>
      </div>
      <ul className="mt-1 divide-y divide-white/[0.06]">
        {exercise.sets.map((set, i) => (
          <SetRow
            key={i}
            index={i}
            set={set}
            onChange={(patch) => changeSet(i, patch)}
            onDelete={() => void removeSet(sessionId, exIdx, i)}
          />
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap justify-between gap-2">
        <Button size="sm" variant="secondary" icon="plus" onClick={() => void addSet(sessionId, exIdx)}>
          Подход
        </Button>
        <Button size="sm" variant="ghost" icon="trash" onClick={onRemove}>
          Удалить упражнение
        </Button>
      </div>
      {libraryExercise && (
        <ExerciseTechniqueSheet
          open={techniqueOpen}
          onClose={() => setTechniqueOpen(false)}
          title={exercise.name}
          exercise={libraryExercise}
        />
      )}
    </Card>
  )
}
