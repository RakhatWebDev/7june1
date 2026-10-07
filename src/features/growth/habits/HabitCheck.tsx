import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { useReduceMotion } from '../../../components/ui/helpers'
import { colorVar, tint } from '../shared'

/**
 * Large tap target that toggles a habit. The check circle fills with the habit
 * colour and the tick is drawn with a CSS transition (springy cubic-bezier).
 */
export function HabitCheck({
  icon,
  name,
  color,
  done,
  auto,
  subtitle,
  compact = false,
  onToggle,
}: {
  icon: string
  name: string
  color: string
  done: boolean
  auto: boolean
  subtitle?: ReactNode
  compact?: boolean
  onToggle: () => void
}) {
  const c = colorVar(color)
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={name}
      onClick={onToggle}
      className={`group flex w-full items-center gap-3 rounded-2xl border text-left transition-[background-color,border-color,transform] duration-200 active:scale-[0.98] motion-reduce:transition-none ${
        compact ? 'min-h-12 px-3 py-2' : 'min-h-16 px-4 py-3'
      } ${done ? '' : 'border-border bg-surface-2/40 hover:bg-surface-2'}`}
      style={done ? { backgroundColor: tint(color, 12), borderColor: tint(color, 45) } : undefined}
    >
      <span aria-hidden className={`${compact ? 'text-xl' : 'text-2xl'} leading-none`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-medium transition-colors ${done ? 'text-text' : 'text-text/90'}`}
        >
          {name}
        </span>
        {(subtitle || auto) && (
          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            {auto && done && (
              <span
                className="rounded-full px-1.5 py-px text-[10px] font-semibold uppercase"
                style={{ color: c, backgroundColor: tint(color, 18) }}
              >
                авто
              </span>
            )}
            {subtitle}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-full border-2 text-bg transition-[transform,background-color] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none ${
          compact ? 'size-8' : 'size-10'
        } ${done ? 'scale-100' : 'scale-90 group-hover:scale-95'}`}
        style={{ borderColor: c, backgroundColor: done ? c : 'transparent' }}
      >
        <svg
          viewBox="0 0 24 24"
          className={compact ? 'size-4' : 'size-5'}
          fill="none"
          stroke="currentColor"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            pathLength={1}
            strokeDasharray={1}
            className="transition-[stroke-dashoffset] delay-75 duration-300 ease-out motion-reduce:transition-none"
            style={{ strokeDashoffset: done ? 0 : 1 }}
          />
        </svg>
      </span>
    </button>
  )
}

/** Seven small squares for the last 7 days ending at `dates[6]`. */
export function MiniWeek({
  dates,
  done,
  color,
}: {
  dates: string[]
  done: Set<string>
  color: string
}) {
  const c = colorVar(color)
  return (
    <ol className="flex gap-1" aria-label="Последние 7 дней">
      {dates.map((d) => {
        const on = done.has(d)
        return (
          <li
            key={d}
            title={d}
            aria-label={`${d}: ${on ? 'выполнено' : 'нет'}`}
            className={`size-3.5 rounded-[4px] transition-colors ${on ? '' : 'bg-surface-2'}`}
            style={on ? { backgroundColor: c } : undefined}
          />
        )
      })}
    </ol>
  )
}

/**
 * Round, compact habit toggle for dashboards (Activity-style bubble): emoji in a tinted
 * circle, label below. On completion the bubble pops with a spring and a tick is drawn.
 */
export function HabitBubble({
  icon,
  name,
  color,
  done,
  auto,
  onToggle,
  showLabel = true,
}: {
  icon: string
  name: string
  color: string
  done: boolean
  auto: boolean
  onToggle: () => void
  /** Show the name under the bubble (the name is always the accessible label). */
  showLabel?: boolean
}) {
  const reduce = useReduceMotion()
  const c = colorVar(color)
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={name}
      title={auto && done ? `${name} · авто` : name}
      onClick={onToggle}
      className="group flex w-full min-w-0 flex-col items-center gap-1.5 rounded-2xl py-1"
    >
      <motion.span
        className={`relative grid place-items-center rounded-full border-2 ${showLabel ? 'size-12 text-[22px]' : 'aspect-square w-full max-w-10 text-lg'} transition-[background-color,border-color] duration-300`}
        style={{
          borderColor: done ? c : tint(color, 30),
          backgroundColor: done ? tint(color, 22) : 'var(--color-surface-2)',
        }}
        animate={reduce ? undefined : { scale: done ? [1, 1.14, 1] : 1 }}
        transition={{ duration: 0.38, ease: 'easeOut' }}
        whileTap={reduce ? undefined : { scale: 0.9 }}
      >
        <span
          aria-hidden
          className={`leading-none transition-opacity ${done ? '' : 'opacity-80 grayscale-[35%]'}`}
        >
          {icon}
        </span>
        <span
          aria-hidden
          className="absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full text-bg ring-2 ring-surface transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none"
          style={{ backgroundColor: c, transform: done ? 'scale(1)' : 'scale(0)' }}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              initial={false}
              animate={{ pathLength: done ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.08, ease: 'easeOut' }}
            />
          </svg>
        </span>
      </motion.span>
      {showLabel && (
        <span
          className={`w-full truncate px-0.5 text-center text-[11px] leading-tight ${done ? 'text-text' : 'text-muted'}`}
        >
          {name}
        </span>
      )}
    </button>
  )
}
