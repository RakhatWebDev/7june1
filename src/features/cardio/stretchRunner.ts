import type { StretchStep } from './stretchRoutines'

/** Pure state machine for the stretch run mode (timer ticks once per second). */
export interface RunnerState {
  index: number
  /** 0 = first (or only) side, 1 = second side */
  side: 0 | 1
  remaining: number
  /** Seconds actually spent with the timer running */
  elapsed: number
  running: boolean
  done: boolean
  /** Highest step index reached — steps up to it count as performed */
  reached: number
}

export type RunnerAction = { type: 'tick' } | { type: 'next' } | { type: 'toggle' } | { type: 'finish' }

export function initRunner(steps: StretchStep[]): RunnerState {
  return { index: 0, side: 0, remaining: steps[0]?.holdSec ?? 0, elapsed: 0, running: false, done: steps.length === 0, reached: 0 }
}

function advance(state: RunnerState, steps: StretchStep[]): RunnerState {
  const cur = steps[state.index]
  if (cur?.perSide && state.side === 0) return { ...state, side: 1, remaining: cur.holdSec }
  const nextIndex = state.index + 1
  if (nextIndex >= steps.length) return { ...state, remaining: 0, running: false, done: true }
  return {
    ...state,
    index: nextIndex,
    side: 0,
    remaining: steps[nextIndex].holdSec,
    reached: Math.max(state.reached, nextIndex),
  }
}

export function runnerReducer(steps: StretchStep[]) {
  return (state: RunnerState, action: RunnerAction): RunnerState => {
    if (state.done) return state
    switch (action.type) {
      case 'tick': {
        if (!state.running) return state
        const next = { ...state, elapsed: state.elapsed + 1, remaining: state.remaining - 1 }
        return next.remaining <= 0 ? advance(next, steps) : next
      }
      case 'next':
        return advance(state, steps)
      case 'toggle':
        return { ...state, running: !state.running }
      case 'finish':
        return { ...state, running: false, done: true }
    }
  }
}

/** Ids of the steps the user reached, de-duplicated, in routine order. */
export function performedExerciseIds(steps: StretchStep[], reached: number): string[] {
  return [...new Set(steps.slice(0, reached + 1).map((s) => s.exerciseId))]
}

/** Activity duration in whole minutes (at least 1). */
export function elapsedToMinutes(elapsedSec: number): number {
  return Math.max(1, Math.round(elapsedSec / 60))
}

/** 75 → "1:15" */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}
