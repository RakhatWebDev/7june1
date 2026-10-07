import { useEffect, useMemo, useReducer } from 'react'
import { requestWakeLock } from './device'
import { initTimer, isRunning, timerReducer } from './timer'

/**
 * React wrapper around the pure countdown: ticks while running and keeps the screen awake.
 * `totalMs` is only used for the initial state — call `reset(ms)` when the duration changes.
 */
export function useCountdown(totalMs: number, intervalMs = 250) {
  const [state, dispatch] = useReducer(timerReducer, totalMs, initTimer)
  const running = isRunning(state)

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), intervalMs)
    return () => clearInterval(t)
  }, [running, intervalMs])

  useEffect(() => {
    if (!running) return
    let release: (() => void) | null = null
    let cancelled = false
    void requestWakeLock().then((r) => {
      if (cancelled) r()
      else release = r
    })
    return () => {
      cancelled = true
      release?.()
    }
  }, [running])

  const actions = useMemo(
    () => ({
      start: () => dispatch({ type: 'start', now: Date.now() }),
      pause: () => dispatch({ type: 'pause', now: Date.now() }),
      finish: () => dispatch({ type: 'finish', now: Date.now() }),
      reset: (ms: number) => dispatch({ type: 'reset', totalMs: ms }),
    }),
    [],
  )

  return { state, running, started: running || state.elapsedMs > 0, ...actions }
}
