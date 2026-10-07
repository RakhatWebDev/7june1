import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Card } from '../../components/ui'
import { ExerciseMedia } from '../../components/ExerciseMedia'
import type { Exercise, SessionExercise, SetLog } from '../../db/types'
import { addSet, applyPreviousWeights, removeSet, updateSet } from './actions'
import { formatPerformance, type PastPerformance } from './calc'
import { restLabel } from './labels'
import { SetRow } from './SetRow'

/** One exercise inside a session: media, short instructions, plan, last time, sets. */
export function SessionExerciseCard({
  sessionId,
  exIdx,
  exercise,
  libraryExercise,
  last,
  onSetDone,
  onRemove,
}: {
  sessionId: string
  exIdx: number
  exercise: SessionExercise
  libraryExercise?: Exercise
  last: PastPerformance | null
  onSetDone: (restSec: number | undefined) => void
  onRemove: () => void
}) {
  const [showMedia, setShowMedia] = useState(false)
  const [showAllSteps, setShowAllSteps] = useState(false)
  const steps = libraryExercise?.instructions ?? []
  const visibleSteps = showAllSteps ? steps : steps.slice(0, 2)
  const doneCount = exercise.sets.filter((s) => s.done).length

  const changeSet = (setIdx: number, patch: Partial<SetLog>) => {
    if (patch.done === true && !exercise.sets[setIdx]?.done) onSetDone(exercise.restSec)
    return updateSet(sessionId, exIdx, setIdx, patch)
  }

  return (
    <Card as="article" className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{exercise.name}</h2>
          <p className="text-xs text-muted">
            План: {exercise.targetSets} × {exercise.targetReps}
            {exercise.restSec ? ` · ${restLabel(exercise.restSec)}` : ''} · выполнено {doneCount}/{exercise.sets.length}
          </p>
          {exercise.notes && <p className="text-xs text-muted">{exercise.notes}</p>}
        </div>
        <Link
          to={`/workouts/exercises/${encodeURIComponent(exercise.exerciseId)}`}
          className="shrink-0 text-xs text-muted hover:text-accent"
        >
          Подробнее
        </Link>
      </div>

      {libraryExercise && (
        <div className="mt-2">
          <button
            type="button"
            className="text-sm text-accent"
            aria-expanded={showMedia}
            onClick={() => setShowMedia((v) => !v)}
          >
            {showMedia ? 'Скрыть технику ▴' : 'Показать технику ▾'}
          </button>
          {showMedia && <ExerciseMedia exercise={libraryExercise} className="mt-2" />}
        </div>
      )}

      {visibleSteps.length > 0 && (
        <div className="mt-2 text-sm text-muted">
          <ol className="list-decimal space-y-1 pl-5">
            {visibleSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {steps.length > 2 && (
            <button type="button" className="mt-1 text-xs text-accent" onClick={() => setShowAllSteps((v) => !v)}>
              {showAllSteps ? 'Свернуть' : `Показать всё (${steps.length})`}
            </button>
          )}
        </div>
      )}

      {last && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
          <p className="text-sm">
            <span className="text-muted">Прошлый раз: </span>
            {formatPerformance(last.sets)}
          </p>
          <Button
            size="sm"
            variant="ghost"
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

      <div className="mt-3 grid grid-cols-[1.25rem_1fr_1fr] gap-x-1.5 text-[11px] text-muted uppercase sm:grid-cols-[1.5rem_8.5rem_8.5rem_1fr] sm:gap-x-3">
        <span>№</span>
        <span>Вес, кг</span>
        <span>Повторы</span>
      </div>
      <ul>
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
        <Button size="sm" variant="secondary" onClick={() => void addSet(sessionId, exIdx)}>
          + Подход
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Удалить упражнение
        </Button>
      </div>
    </Card>
  )
}
