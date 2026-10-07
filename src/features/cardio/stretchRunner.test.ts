import { describe, expect, it } from 'vitest'
import type { StretchStep } from './stretchRoutines'
import { elapsedToMinutes, formatClock, initRunner, performedExerciseIds, runnerReducer, type RunnerState } from './stretchRunner'

const steps: StretchStep[] = [
  { exerciseId: 'A', nameRu: 'А', holdSec: 2, perSide: true },
  { exerciseId: 'B', nameRu: 'Б', holdSec: 3, perSide: false },
]
const reduce = runnerReducer(steps)
const tick = (s: RunnerState, n = 1) => {
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'tick' })
  return s
}

describe('stretch runner', () => {
  it('ignores ticks while paused', () => {
    const s = initRunner(steps)
    expect(tick(s, 5)).toEqual(s)
  })

  it('runs both sides of a unilateral stretch, then moves on and finishes', () => {
    let s = reduce(initRunner(steps), { type: 'toggle' })
    s = tick(s, 2)
    expect(s).toMatchObject({ index: 0, side: 1, remaining: 2 })
    s = tick(s, 2)
    expect(s).toMatchObject({ index: 1, side: 0, remaining: 3, reached: 1 })
    s = tick(s, 3)
    expect(s.done).toBe(true)
    expect(s.elapsed).toBe(7)
    expect(performedExerciseIds(steps, s.reached)).toEqual(['A', 'B'])
  })

  it('"next" skips to the other side, then to the next step', () => {
    let s = reduce(initRunner(steps), { type: 'next' })
    expect(s).toMatchObject({ index: 0, side: 1 })
    s = reduce(s, { type: 'next' })
    expect(s).toMatchObject({ index: 1, side: 0 })
  })

  it('"finish" ends early and only counts reached steps', () => {
    const s = reduce(initRunner(steps), { type: 'finish' })
    expect(s.done).toBe(true)
    expect(performedExerciseIds(steps, s.reached)).toEqual(['A'])
  })

  it('formats helpers', () => {
    expect(formatClock(75)).toBe('1:15')
    expect(formatClock(5)).toBe('0:05')
    expect(elapsedToMinutes(0)).toBe(1)
    expect(elapsedToMinutes(590)).toBe(10)
  })
})
