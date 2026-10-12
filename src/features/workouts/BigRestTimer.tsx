import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { Button, Chip } from '../../components/ui'
import { Icon } from '../../components/icons'
import { useReduceMotion } from '../../components/ui/helpers'
import { formatClock } from './calc'
import { useRestCountdown } from './useRestCountdown'

const SIZE = 168
const STROKE = 10
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

/** Quick rest presets (seconds) shown as chips under the big timer. */
const REST_PRESETS = [60, 90, 120, 180] as const

/**
 * Large inline rest timer of the guided session: a ≈160 px ring that drains with a glowing head,
 * remaining time in the middle, «+30 с», «Пропустить» (→ `doneLabel` at zero) and duration presets.
 * Last 5 s pulse in warn; at zero it shakes, vibrates once (shared `useRestCountdown`) and turns lime;
 * `onElapsed` fires once. Remount with a new `key` to restart.
 */
export function BigRestTimer({
  durationSec,
  label,
  doneLabel = 'Следующий подход',
  onDone,
  onElapsed,
  onPreset,
}: {
  durationSec: number
  /** «следующий: подход 3 из 4» */
  label: string
  doneLabel?: string
  /** Skip / continue */
  onDone: () => void
  /** Called once when the countdown reaches zero */
  onElapsed?: () => void
  /** Restart with another duration (chips 1:00 / 1:30 / 2:00 / 3:00) */
  onPreset?: (sec: number) => void
}) {
  const reduce = useReduceMotion()
  const { remaining, finished, warning, fraction, addTime } = useRestCountdown(durationSec)
  const elapsedRef = useRef(onElapsed)
  useEffect(() => {
    elapsedRef.current = onElapsed
  })
  useEffect(() => {
    if (finished) elapsedRef.current?.()
  }, [finished])

  const tone = finished ? 'var(--color-accent)' : warning ? 'var(--color-warn)' : 'var(--color-accent)'
  const offset = C * (1 - fraction)
  // Glowing head at the end of the arc (angle measured clockwise from 12 o'clock).
  const angle = fraction * 2 * Math.PI
  const headX = SIZE / 2 + R * Math.sin(angle)
  const headY = SIZE / 2 - R * Math.cos(angle)

  return (
    <motion.div
      role="timer"
      aria-live="polite"
      aria-label="Таймер отдыха"
      data-testid="big-rest-timer"
      initial={reduce ? false : { opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={`flex flex-col items-center rounded-3xl border px-3 pt-4 pb-3 transition-colors duration-300 ${
        finished
          ? 'animate-shake border-accent/60 bg-accent/[0.08]'
          : warning
            ? 'border-warn/40 bg-surface-2'
            : 'border-white/[0.06] bg-surface-2'
      }`}
    >
      <p className={`text-center text-sm font-medium ${finished ? 'text-accent' : 'text-muted'}`}>
        {finished ? 'Отдых окончен!' : 'Отдых'} · {label}
      </p>
      <div
        className={`relative my-3 ${warning ? 'animate-pulse-soft' : ''}`}
        style={{ width: SIZE, height: SIZE }}
      >
        {!reduce && !finished && (
          <span
            aria-hidden
            className="absolute inset-3 animate-pulse-soft rounded-full blur-2xl"
            style={{ background: `color-mix(in srgb, ${tone} 18%, transparent)` }}
          />
        )}
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="relative" aria-hidden>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              stroke={finished ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 14%, transparent)'}
            />
            {!reduce && fraction > 0 && (
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                strokeWidth={STROKE + 8}
                strokeLinecap="round"
                stroke={tone}
                strokeDasharray={C}
                strokeDashoffset={offset}
                opacity={0.18}
                style={{ transition: 'stroke-dashoffset 250ms linear, stroke 300ms ease-out' }}
              />
            )}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              stroke={tone}
              strokeDasharray={C}
              strokeDashoffset={offset}
              opacity={fraction === 0 ? 0 : 1}
              style={reduce ? undefined : { transition: 'stroke-dashoffset 250ms linear, stroke 300ms ease-out' }}
            />
          </g>
          {fraction > 0 && (
            <circle
              cx={headX}
              cy={headY}
              r={STROKE / 2 + 2}
              fill="var(--color-bg)"
              stroke={tone}
              strokeWidth={3}
              style={reduce ? undefined : { transition: 'cx 250ms linear, cy 250ms linear' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {finished ? (
            <Icon name="check" size={44} strokeWidth={2.5} className="text-accent" />
          ) : (
            <Icon name="timer" size={18} className="mb-0.5 text-muted" />
          )}
          <span
            className={`text-[44px] leading-none font-bold tracking-tight tabular-nums ${
              finished ? 'sr-only' : warning ? 'text-warn' : ''
            }`}
            data-testid="big-rest-remaining"
          >
            {formatClock(remaining)}
          </span>
        </div>
      </div>
      {onPreset && (
        <div role="group" aria-label="Длительность отдыха" className="mb-3 flex flex-wrap justify-center gap-1.5">
          {REST_PRESETS.map((sec) => (
            <Chip key={sec} active={durationSec === sec} onClick={() => onPreset(sec)} className="tabular-nums">
              {formatClock(sec)}
            </Chip>
          ))}
        </div>
      )}
      <div className="grid w-full grid-cols-[auto_1fr] gap-2">
        <Button variant="secondary" className="min-h-12!" onClick={addTime}>
          +30 с
        </Button>
        <Button variant={finished ? 'primary' : 'ghost'} className="min-h-12! px-3!" onClick={onDone}>
          {finished ? doneLabel : 'Пропустить'}
        </Button>
      </div>
    </motion.div>
  )
}
