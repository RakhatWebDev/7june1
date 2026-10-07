/**
 * Pure countdown state machine shared by the meditation / prayer timer and the breathing
 * session. Time is measured from wall-clock timestamps passed in with each action, so a
 * throttled background tab does not slow the timer down.
 */
export interface TimerState {
  totalMs: number
  /** Time actually spent running */
  elapsedMs: number
  /** Timestamp of the last start/tick while running; null when paused or not started */
  lastTick: number | null
  done: boolean
}

export type TimerAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'finish'; now: number }
  | { type: 'reset'; totalMs: number }

export function initTimer(totalMs: number): TimerState {
  return { totalMs, elapsedMs: 0, lastTick: null, done: false }
}

function accumulate(state: TimerState, now: number): TimerState {
  if (state.lastTick == null) return state
  const elapsedMs = Math.min(state.totalMs, state.elapsedMs + Math.max(0, now - state.lastTick))
  return { ...state, elapsedMs, lastTick: now }
}

export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  if (action.type === 'reset') return initTimer(action.totalMs)
  if (state.done) return state
  switch (action.type) {
    case 'start':
      return state.lastTick == null ? { ...state, lastTick: action.now } : state
    case 'pause':
      return { ...accumulate(state, action.now), lastTick: null }
    case 'tick': {
      const next = accumulate(state, action.now)
      return next.elapsedMs >= next.totalMs ? { ...next, lastTick: null, done: true } : next
    }
    case 'finish':
      return { ...accumulate(state, action.now), lastTick: null, done: true }
  }
}

export function isRunning(state: TimerState): boolean {
  return state.lastTick != null && !state.done
}

export function remainingMs(state: TimerState): number {
  return Math.max(0, state.totalMs - state.elapsedMs)
}

/** True when the timer ran all the way down to zero (not finished early). */
export function completed(state: TimerState): boolean {
  return state.done && state.elapsedMs >= state.totalMs
}

/** Shorter sessions (an accidental tap) are not saved. */
export const MIN_SAVE_MS = 15_000

export function shouldSave(elapsedMs: number): boolean {
  return elapsedMs >= MIN_SAVE_MS
}

/** Stored duration in whole minutes (at least 1). */
export function sessionMinutes(elapsedMs: number): number {
  return Math.max(1, Math.round(elapsedMs / 60_000))
}

/** 75 → "1:15", 3725 → "1:02:05" */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = (s % 60).toString().padStart(2, '0')
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
