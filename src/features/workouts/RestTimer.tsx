import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { formatClock } from './calc'

/**
 * Rest countdown shown after a set is marked done. Big digits, "+30 с" and "Пропустить".
 * At zero: vibrates (if supported) once and switches to a highlighted "time is up" state.
 * Remount with a new `key` to restart.
 */
export function RestTimer({ durationSec, onClose }: { durationSec: number; onClose: () => void }) {
  const [endsAt, setEndsAt] = useState(() => Date.now() + durationSec * 1000)
  const [now, setNow] = useState(() => Date.now())
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000))
  const finished = remaining === 0
  const vibrated = useRef(false)

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

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 px-4" role="timer" aria-live="polite" aria-label="Таймер отдыха">
      <div
        className={`mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border p-3 shadow-lg ${
          finished ? 'animate-pulse border-accent bg-accent text-bg' : 'border-border bg-surface-2'
        }`}
      >
        <div className="min-w-0">
          <div className={`text-xs ${finished ? 'text-bg' : 'text-muted'}`}>
            {finished ? 'Отдых окончен — следующий подход!' : 'Отдых'}
          </div>
          <div className="text-4xl leading-none font-bold tabular-nums" data-testid="rest-remaining">
            {formatClock(remaining)}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={addTime}>
            +30 с
          </Button>
          <Button variant={finished ? 'secondary' : 'ghost'} size="sm" onClick={onClose}>
            {finished ? 'Закрыть' : 'Пропустить'}
          </Button>
        </div>
      </div>
    </div>
  )
}
