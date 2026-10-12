import type { SessionExercise, SetLog } from '../../db/types'
import { parseReps } from './autoreg'
import type { PastPerformance } from './calc'

/* ------------------------------------------------------------------ */
/* Pure helpers of the guided («По шагам») session flow.               */
/* ------------------------------------------------------------------ */

/** An exercise is pending while it has at least one set that is not done. */
export function isPending(e: SessionExercise): boolean {
  return e.sets.some((s) => !s.done)
}

/** Index of the first not-done set, or -1. */
export function nextUndoneSet(e: SessionExercise): number {
  return e.sets.findIndex((s) => !s.done)
}

/** First pending exercise index, or -1. */
export function firstPending(exercises: SessionExercise[]): number {
  return exercises.findIndex(isPending)
}

/**
 * The exercise to go to after `from`: the first pending one after it, else the first pending one
 * before it (skipped earlier), else -1 (everything is done).
 */
export function nextPending(exercises: SessionExercise[], from: number): number {
  for (let i = from + 1; i < exercises.length; i++) if (isPending(exercises[i])) return i
  for (let i = 0; i < Math.min(from, exercises.length); i++) if (isPending(exercises[i])) return i
  return -1
}

/**
 * Patch for «Завершить подход»: marks the set done and fills empty weight / reps — from the set's target
 * (weight, lower bound of reps), else from the previous performance (same set index, else its last set),
 * else reps from the exercise plan («8-12» → 8).
 */
export function finishSetPatch(e: SessionExercise, setIdx: number, last: PastPerformance | null): Partial<SetLog> {
  const set = e.sets[setIdx]
  const patch: Partial<SetLog> = { done: true }
  if (!set) return patch
  const target = e.targets?.[setIdx]
  const prev = last ? (last.sets[setIdx] ?? last.sets[last.sets.length - 1]) : undefined
  if (set.weightKg == null) {
    const w = target?.weightKg ?? prev?.weightKg
    if (w != null) patch.weightKg = w
  }
  if (set.reps == null) {
    const r = (target ? parseReps(target.reps)?.min : undefined) ?? prev?.reps ?? parseReps(e.targetReps)?.min
    if (r != null) patch.reps = r
  }
  return patch
}
