import { describe, expect, it } from 'vitest'
import type { SessionExercise } from '../../../db/types'
import { finishSetPatch, firstPending, nextPending, nextUndoneSet } from '../guided'
import { set } from './helpers'

const ex = (sets: boolean[], extra: Partial<SessionExercise> = {}): SessionExercise => ({
  exerciseId: 'X',
  name: 'X',
  targetSets: sets.length,
  targetReps: '8-12',
  sets: sets.map((d) => set(null, null, d)),
  ...extra,
})

describe('guided helpers', () => {
  it('finds pending exercises and sets', () => {
    const list = [ex([true, true]), ex([true, false]), ex([]), ex([false])]
    expect(firstPending(list)).toBe(1)
    expect(nextUndoneSet(list[1])).toBe(1)
    expect(nextUndoneSet(list[0])).toBe(-1)
    expect(nextPending(list, 1)).toBe(3)
    // wraps to a skipped earlier exercise
    expect(nextPending([ex([false]), ex([true]), ex([true])], 2)).toBe(0)
    expect(nextPending([ex([true]), ex([true])], 0)).toBe(-1)
  })

  it('prefills a finished set from the target, then last time, then the plan', () => {
    const withTargets = ex([false, false], { targets: [{ reps: '6-8', weightKg: 50 }, { reps: 'AMRAP' }] })
    expect(finishSetPatch(withTargets, 0, null)).toEqual({ done: true, weightKg: 50, reps: 6 })
    const last = { sessionId: 'p', startedAt: '', sets: [{ weightKg: 40, reps: 12 }] }
    // AMRAP target → no reps; last performance (its last set) fills the gaps
    expect(finishSetPatch(withTargets, 1, last)).toEqual({ done: true, weightKg: 40, reps: 12 })
    expect(finishSetPatch(ex([false]), 0, null)).toEqual({ done: true, reps: 8 })
    // values already typed are kept
    const typed = ex([false])
    typed.sets[0] = set(70, 3, false)
    expect(finishSetPatch(typed, 0, last)).toEqual({ done: true })
  })
})
