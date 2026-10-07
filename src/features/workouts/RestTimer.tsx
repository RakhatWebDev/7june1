import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { Icon } from '../../components/icons'
import { useReduceMotion } from '../../components/ui/helpers'
import { formatClock } from './calc'

const RING = 60
const STROKE = 5
const R = (RING - STROKE) / 2
const C = 2 * Math.PI * R

/**
 * Rest countdown shown after a set is marked done: a circular ring that drains smoothly,
 * big digits, "+30 с" and "Пропустить". The ring pulses during the last 5 s; at zero the card
 * shakes, vibrates (if supported) once and switches to a lime "time is up" state.
 * Remount with a new `key` to restart.
 */
export function RestTimer({ durationSec, onClose }: { durationSec: number; onClose: () => void }) {
  const reduce = useReduceMotion()
  const [startedAt] = useState(() => Date.now())
  const [endsAt, setEndsAt] = useState(() => Date.now() + durationSec * 1000)
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

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(var(--safe-bottom)+68px)] z-40 px-3"
      role="timer"
      aria-live="polite"
      aria-label="Таймер отдыха"
    >
      <div
        className={`mx-auto flex max-w-3xl items-center gap-3 rounded-3xl border p-2.5 pr-3 shadow-[var(--shadow-float)] backdrop-blur-xl transition-colors duration-300 ${
          finished
            ? 'animate-shake border-accent/60 bg-surface-2/95'
            : warning
              ? 'border-warn/40 bg-surface-2/95'
              : 'border-white/[0.08] bg-surface-2/90'
        }`}
      >
        <div className={`relative shrink-0 ${warning ? 'animate-pulse-soft' : ''}`} style={{ width: RING, height: RING }}>
          <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} className="-rotate-90" aria-hidden>
            <circle
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              stroke={finished ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 16%, transparent)'}
            />
            <circle
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              stroke={warning ? 'var(--color-warn)' : 'var(--color-accent)'}
              strokeDasharray={C}
              strokeDashoffset={C * (1 - fraction)}
              opacity={fraction === 0 ? 0 : 1}
              style={reduce ? undefined : { transition: 'stroke-dashoffset 250ms linear, stroke 300ms ease-out' }}
            />
          </svg>
          <span className={`absolute inset-0 grid place-items-center ${finished ? 'text-accent' : 'text-muted'}`}>
            <Icon name={finished ? 'check' : 'timer'} size={22} strokeWidth={finished ? 2.5 : 1.75} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-xs font-medium ${finished ? 'text-accent' : 'text-muted'}`}>
            {finished ? 'Отдых окончен — следующий подход!' : 'Отдых'}
          </div>
          <div
            className={`text-[34px] leading-none font-bold tracking-tight tabular-nums ${warning ? 'text-warn' : ''}`}
            data-testid="rest-remaining"
          >
            {formatClock(remaining)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 min-[380px]:flex-row">
          <Button variant="secondary" size="sm" onClick={addTime}>
            +30 с
          </Button>
          <Button variant={finished ? 'primary' : 'ghost'} size="sm" onClick={onClose}>
            {finished ? 'Закрыть' : 'Пропустить'}
          </Button>
        </div>
      </div>
    </div>
  )
}
