import { describe, expect, it } from 'vitest'
import type { SessionExercise } from '../../../db/types'
import type { PastPerformance } from '../calc'
import { cueForTarget, nextAfter, nextCue, tapTarget } from '../handsFree'
import { set } from './helpers'

const ex = (done: boolean[], extra: Partial<SessionExercise> = {}): SessionExercise => ({
  exerciseId: 'X',
  name: 'X',
  targetSets: done.length,
  targetReps: '8-12',
  sets: done.map((d) => set(null, null, d)),
  ...extra,
})

describe('tapTarget', () => {
  it('is the next undone set of the current exercise', () => {
    expect(tapTarget([ex([true, false, false])], 0)).toEqual({ exIdx: 0, setIdx: 1 })
  })

  it('moves to the first undone set of the next pending exercise when the current one is complete', () => {
    expect(tapTarget([ex([true, true]), ex([true]), ex([false, false])], 0)).toEqual({
      exIdx: 2,
      setIdx: 0,
    })
  })

  it('is null when nothing is left', () => {
    expect(tapTarget([ex([true]), ex([true])], 1)).toBeNull()
  })
})

describe('nextAfter', () => {
  it('skips the set that was just marked done', () => {
    expect(nextAfter([ex([false, false, false])], 0, 0)).toEqual({ exIdx: 0, setIdx: 1 })
  })

  it('goes to the next exercise after the last set', () => {
    expect(nextAfter([ex([true, false]), ex([false])], 0, 1)).toEqual({ exIdx: 1, setIdx: 0 })
  })

  it('is null after the final set', () => {
    expect(nextAfter([ex([true, false])], 0, 1)).toBeNull()
  })
})

describe('warm-ups', () => {
  const warm = (done: boolean[]) => done.map((d) => set(40, 8, d, { warmup: true }))

  it('a tap starts with the undone warm-ups of a fresh exercise', () => {
    expect(tapTarget([ex([false, false], { warmups: warm([true, false]) })], 0)).toEqual({
      exIdx: 0,
      setIdx: 1,
      warmup: true,
    })
  })

  it('skips the warm-ups once a working set is done', () => {
    expect(tapTarget([ex([true, false], { warmups: warm([false]) })], 0)).toEqual({
      exIdx: 0,
      setIdx: 1,
    })
  })

  it('after the last warm-up comes the first working set', () => {
    expect(nextAfter([ex([false, false], { warmups: warm([true, false]) })], 0, 1, true)).toEqual({
      exIdx: 0,
      setIdx: 0,
    })
  })

  it('the next exercise starts with its warm-ups', () => {
    expect(nextAfter([ex([true, false]), ex([false], { warmups: warm([false]) })], 0, 1)).toEqual({
      exIdx: 1,
      setIdx: 0,
      warmup: true,
    })
  })

  it('a warm-up cue has its own load and no history', () => {
    const e = ex([false], { warmups: [set(40, 8, false, { warmup: true })] })
    expect(cueForTarget([e], { exIdx: 0, setIdx: 0, warmup: true }, [null], 0)).toEqual({
      warmup: true,
      setNo: 1,
      weightKg: 40,
      reps: '8',
      last: null,
    })
  })
})

describe('nextCue', () => {
  const base = { totalSec: 120, warned: false, went: false, overdueMs: 0 }

  it('warns once between 10 and 3 seconds left', () => {
    expect(nextCue({ ...base, remainingSec: 11 })).toBeNull()
    expect(nextCue({ ...base, remainingSec: 10 })).toBe('warn')
    expect(nextCue({ ...base, remainingSec: 3 })).toBe('warn')
    expect(nextCue({ ...base, remainingSec: 2 })).toBeNull()
    expect(nextCue({ ...base, remainingSec: 8, warned: true })).toBeNull()
  })

  it('does not warn on rests of 15 s or less', () => {
    expect(nextCue({ ...base, totalSec: 15, remainingSec: 8 })).toBeNull()
  })

  it('says go once at zero, and drops it when the user comes back more than a minute late', () => {
    expect(nextCue({ ...base, remainingSec: 0, overdueMs: 0 })).toBe('go')
    expect(nextCue({ ...base, remainingSec: 0, overdueMs: 60_000 })).toBe('go')
    expect(nextCue({ ...base, remainingSec: 0, overdueMs: 60_001 })).toBeNull()
    expect(nextCue({ ...base, remainingSec: 0, went: true })).toBeNull()
  })
})

describe('cueForTarget', () => {
  const last: PastPerformance = {
    sessionId: 'p',
    startedAt: '',
    sets: [
      { weightKg: 80, reps: 6 },
      { weightKg: 80, reps: 5 },
    ],
  }

  it('uses the set target and the same set from last time', () => {
    const bench = ex([true, false], {
      name: 'Жим лёжа',
      targets: [
        { reps: '6', weightKg: 80 },
        { reps: '6', weightKg: 82.5 },
      ],
    })
    expect(cueForTarget([bench], { exIdx: 0, setIdx: 1 }, [last], 0)).toEqual({
      setNo: 2,
      weightKg: 82.5,
      reps: '6',
      last: { weightKg: 80, reps: 5 },
    })
  })

  it('names the exercise only when it changes, and falls back to the plan reps', () => {
    const row = ex([false], { name: 'Тяга' })
    expect(cueForTarget([ex([true]), row], { exIdx: 1, setIdx: 0 }, [null, null], 0)).toEqual({
      exerciseName: 'Тяга',
      setNo: 1,
      weightKg: null,
      reps: '8-12',
      last: null,
    })
  })

  it('takes the weight from last time when there is no target', () => {
    const e = ex([false])
    expect(cueForTarget([e], { exIdx: 0, setIdx: 0 }, [last], 0)?.weightKg).toBe(80)
  })

  it('is null without a target', () => {
    expect(cueForTarget([ex([true])], null, [null], 0)).toBeNull()
  })
})
