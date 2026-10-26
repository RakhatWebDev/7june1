import { useEffect, useRef, useState } from 'react'

export interface RestCountdown {
  /** Whole seconds left (rounded up), 0 when finished */
  remaining: number
  finished: boolean
  /** Last 5 seconds */
  warning: boolean
  /** Share of the (possibly extended) period still left, 1 → 0 */
  fraction: number
  /** Adds 30 s (from now if already finished) */
  addTime: () => void
  /** Wall-clock end of the rest (ms), moved by `addTime` */
  endsAt: number
}

/**
 * Shared rest-timer logic: a wall-clock based countdown (robust to throttled intervals), `+30 с`,
 * and a single vibration when it reaches zero. Remount the owner (new `key`) to restart.
 * `initialEndsAt` resumes a stored rest (e.g. after a reload) instead of starting `durationSec` anew.
 */
export function useRestCountdown(durationSec: number, opts: { initialEndsAt?: number } = {}): RestCountdown {
  const [endsAt, setEndsAt] = useState(() => opts.initialEndsAt ?? Date.now() + durationSec * 1000)
  const [startedAt] = useState(() => Math.min(Date.now(), endsAt - durationSec * 1000))
  const [now, setNow] = useState(() => Date.now())
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000))
  const finished = remaining === 0
  const warning = !finished && remaining <= 5
  const vibrated = useRef(false)
  const fraction = finished ? 0 : Math.max(0, Math.min(1, (endsAt - now) / Math.max(1, endsAt - startedAt)))

  useEffect(() => {
    if (finished) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [finished])

  useEffect(() => {
    if (!finished) {
      vibrated.current = false
      return
    }
    if (vibrated.current) return
    vibrated.current = true
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([300, 150, 300])
  }, [finished])

  const addTime = () => {
    const t = Date.now()
    setEndsAt((e) => Math.max(e, t) + 30_000)
    setNow(t)
  }

  return { remaining, finished, warning, fraction, addTime, endsAt }
}
