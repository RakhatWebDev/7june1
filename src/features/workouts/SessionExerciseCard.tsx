import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Card } from '../../components/ui'
import { Icon } from '../../components/icons'
import { ExerciseMedia } from '../../components/ExerciseMedia'
import { exerciseImageUrl } from '../../data/exercises'
import type { Exercise, SessionExercise, SetLog } from '../../db/types'
import { addSet, applyPreviousWeights, removeSet, updateSet, updateWarmup } from './actions'
import { hintTrend } from './autoreg'
import { fmtKg, formatPerformance, type PastPerformance } from './calc'
import { planLine } from './labels'
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
  onReplace,
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
  /** Opens «Альтернативы» to replace this exercise */
  onReplace?: () => void
}) {
  const [techniqueOpen, setTechniqueOpen] = useState(false)
  const [showAllSteps, setShowAllSteps] = useState(false)
  const steps = libraryExercise?.instructions ?? []
  const visibleSteps = showAllSteps ? steps : steps.slice(0, 2)
  const doneCount = exercise.sets.filter((s) => s.done).length
  const allDone = exercise.sets.length > 0 && doneCount === exercise.sets.length

  return (
    <Card
      as="article"
      className={`p-3 transition-[border-color] duration-300 ${allDone ? 'border-accent/30' : ''}`}
    >
      <div className="flex items-start gap-3">
        {hideMedia && libraryExercise?.images[0] ? (
          <TechniqueThumb
            name={exercise.name}
            libraryExercise={libraryExercise}
            onOpen={() => setTechniqueOpen(true)}
          />
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
            <span>{planLine(exercise)}</span>
            <span className={allDone ? 'text-accent' : ''}>
              · выполнено {doneCount}/{exercise.sets.length}
            </span>
          </p>
          {exercise.hint && <ExerciseHint hint={exercise.hint} />}
          {exercise.notes && <p className="mt-0.5 text-xs text-muted">{exercise.notes}</p>}
        </div>
        {onReplace && (
          <button
            type="button"
            aria-label={`Заменить: ${exercise.name}`}
            title="Заменить"
            onClick={onReplace}
            className="-mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-accent"
          >
            <Icon name="edit" size={18} />
          </button>
        )}
        <Link
          to={`/workouts/exercises/${encodeURIComponent(exercise.exerciseId)}`}
          aria-label={`Подробнее: ${exercise.name}`}
          className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-accent"
        >
          <Icon name="info" size={19} />
        </Link>
      </div>

      {libraryExercise && !hideMedia && (
        <TechniqueMedia
          name={exercise.name}
          libraryExercise={libraryExercise}
          onOpen={() => setTechniqueOpen(true)}
        />
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

      {last && <LastTimeRow sessionId={sessionId} exIdx={exIdx} last={last} />}

      <WarmupChips sessionId={sessionId} exIdx={exIdx} exercise={exercise} />
      <SetList
        sessionId={sessionId}
        exIdx={exIdx}
        exercise={exercise}
        onSetDone={() => onSetDone(exercise.restSec)}
      />
      <div className="mt-2 flex flex-wrap justify-between gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          onClick={() => void addSet(sessionId, exIdx)}
        >
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

/** Small square thumbnail (media hidden) that opens the technique sheet. */
export function TechniqueThumb({
  name,
  libraryExercise,
  onOpen,
  className = 'size-14',
}: {
  name: string
  libraryExercise: Exercise
  onOpen: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={`Техника: ${name}`}
      className={`shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-white/10 ${className}`}
      onClick={onOpen}
    >
      <img
        src={exerciseImageUrl(libraryExercise.images[0])}
        alt=""
        loading="lazy"
        className="h-full w-full object-contain"
      />
    </button>
  )
}

/** Inline technique animation; tapping it opens the big technique sheet. */
export function TechniqueMedia({
  name,
  libraryExercise,
  onOpen,
  className = 'mt-3 max-w-[260px]',
  mediaClassName = 'max-h-[180px]',
}: {
  name: string
  libraryExercise: Exercise
  onOpen: () => void
  className?: string
  mediaClassName?: string
}) {
  return (
    <div className={`relative mx-auto w-full ${className}`} data-testid="session-media">
      <ExerciseMedia exercise={libraryExercise} className={mediaClassName} />
      {/* Overlay (sibling, not nested — ExerciseMedia is itself a button) opens the big view */}
      <button
        type="button"
        aria-label={`Техника: ${name}`}
        className="absolute inset-0 rounded-2xl"
        onClick={onOpen}
      />
    </div>
  )
}

/** «Прошлый раз: 80 кг × 5, 5, 5» with «Повторить прошлый вес». */
export function LastTimeRow({
  sessionId,
  exIdx,
  last,
}: {
  sessionId: string
  exIdx: number
  last: PastPerformance
}) {
  return (
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
  )
}

/** Warm-up sets as chips («40 × 8»); a tap ticks one off. Not part of volume or PRs. */
export function WarmupChips({
  sessionId,
  exIdx,
  exercise,
}: {
  sessionId: string
  exIdx: number
  exercise: SessionExercise
}) {
  const warmups = exercise.warmups ?? []
  if (warmups.length === 0) return null
  return (
    <div role="group" aria-label="Разминка" className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium tracking-wide text-muted uppercase">Разминка</span>
      {warmups.map((w, i) => {
        const text = `${fmtKg(w.weightKg ?? 0)} × ${w.reps ?? 0}`
        return (
          <button
            key={i}
            type="button"
            aria-label={`Разминка ${i + 1}: ${text}`}
            aria-pressed={w.done}
            onClick={() => void updateWarmup(sessionId, exIdx, i, { done: !w.done })}
            className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors ${
              w.done
                ? 'border-transparent bg-accent/15 text-accent'
                : 'border-border bg-surface-2 text-muted'
            }`}
          >
            {w.done && <Icon name="check" size={14} />}
            {text}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Column header + set rows of one exercise. `onSetDone(setIdx)` fires when a set becomes done;
 * `highlightIdx` rings the next set to do (guided mode).
 */
export function SetList({
  sessionId,
  exIdx,
  exercise,
  onSetDone,
  highlightIdx,
}: {
  sessionId: string
  exIdx: number
  exercise: SessionExercise
  onSetDone: (setIdx: number) => void
  highlightIdx?: number
}) {
  const changeSet = (setIdx: number, patch: Partial<SetLog>) => {
    if (patch.done === true && !exercise.sets[setIdx]?.done) onSetDone(setIdx)
    return updateSet(sessionId, exIdx, setIdx, patch)
  }
  return (
    <>
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
            target={exercise.targets?.[i]}
            highlight={i === highlightIdx}
            onChange={(patch) => changeSet(i, patch)}
            onDelete={() => void removeSet(sessionId, exIdx, i)}
          />
        ))}
      </ul>
    </>
  )
}

/** Auto-regulation explanation under the exercise title: accent for ↑, warn for ↓. */
export function ExerciseHint({ hint }: { hint: string }) {
  const trend = hintTrend(hint)
  const text = trend === 'none' ? hint : hint.slice(1).trimStart()
  const tone = trend === 'up' ? 'text-accent' : trend === 'down' ? 'text-warn' : 'text-muted'
  const icon =
    trend === 'up'
      ? 'arrow-up'
      : trend === 'down'
        ? 'arrow-down'
        : trend === 'same'
          ? 'minus'
          : 'target'
  return (
    <p className={`mt-1 flex items-start gap-1 text-xs ${tone}`} data-testid="exercise-hint">
      <Icon name={icon} size={13} className="mt-px shrink-0" />
      <span className="min-w-0">{text}</span>
    </p>
  )
}
