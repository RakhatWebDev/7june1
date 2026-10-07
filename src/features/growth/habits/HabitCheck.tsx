import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useReduceMotion } from '../../../components/ui/helpers'
import { colorVar, tint } from '../shared'

/**
 * Round check mark in the habit colour: pops with a spring when it becomes done and the tick
 * is drawn with `pathLength` 0 → 1 (the same motion as `HabitBubble`). Static under reduced motion.
 */
export function SpringCheck({
  color,
  done,
  size = 'md',
}: {
  color: string
  done: boolean
  size?: 'sm' | 'md'
}) {
  const reduce = useReduceMotion()
  const c = colorVar(color)
  return (
    <motion.span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full border-2 text-bg transition-[background-color,border-color] duration-200 ${
        size === 'sm' ? 'size-8' : 'size-10'
      }`}
      style={{ borderColor: done ? c : tint(color, 45), backgroundColor: done ? c : 'transparent' }}
      initial={false}
      animate={reduce ? undefined : { scale: done ? [1, 1.2, 1] : [1, 0.9, 1] }}
      transition={{ duration: 0.38, ease: 'easeOut' }}
    >
      <svg
        viewBox="0 0 24 24"
        className={size === 'sm' ? 'size-4' : 'size-5'}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.08, ease: 'easeOut' }}
        />
      </svg>
    </motion.span>
  )
}

/**
 * Large tap target that toggles a habit: emoji in a tinted badge, name, and a spring check
 * in the habit colour. Briefly flashes with the habit colour when it gets checked.
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
  const reduce = useReduceMotion()
  const [flash, setFlash] = useState(0)
  const c = colorVar(color)
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={name}
      onClick={() => {
        if (!done) setFlash((n) => n + 1)
        onToggle()
      }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border text-left transition-[background-color,border-color] duration-200 ${
        compact ? 'min-h-12 px-3 py-2' : 'min-h-16 px-3.5 py-3'
      } ${done ? '' : 'border-white/[0.06] bg-surface-2/50 hover:bg-surface-2'}`}
      style={done ? { backgroundColor: tint(color, 10), borderColor: tint(color, 40) } : undefined}
    >
      {flash > 0 && !reduce && <TintFlash key={flash} color={color} />}
      <span
        aria-hidden
        className={`relative grid shrink-0 place-items-center leading-none ${
          compact ? 'size-8 rounded-xl text-lg' : 'size-11 rounded-2xl text-2xl'
        }`}
        style={{ backgroundColor: tint(color, done ? 22 : 12) }}
      >
        {icon}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className={`block truncate font-medium ${done ? 'text-text' : 'text-text/90'}`}>{name}</span>
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
      <span className="relative">
        <SpringCheck color={color} done={done} size={compact ? 'sm' : 'md'} />
      </span>
    </motion.button>
  )
}

/** One-shot wash of the habit colour over its card (opacity only), 600 ms. */
export function TintFlash({ color }: { color: string }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ backgroundColor: tint(color, 38) }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    />
  )
}

/** Seven small squares for the last 7 days ending at `dates[6]`; they pop in left to right. */
export function MiniWeek({
  dates,
  done,
  color,
}: {
  dates: string[]
  done: Set<string>
  color: string
}) {
  const reduce = useReduceMotion()
  const c = colorVar(color)
  return (
    <ol className="flex gap-1" aria-label="Последние 7 дней">
      {dates.map((d, i) => {
        const on = done.has(d)
        return (
          <motion.li
            key={d}
            title={d}
            aria-label={`${d}: ${on ? 'выполнено' : 'нет'}`}
            className={`size-3.5 rounded-[4px] transition-colors duration-300 ${on ? '' : 'bg-surface-3/70'}`}
            style={on ? { backgroundColor: c, boxShadow: `0 0 8px -2px ${c}` } : undefined}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: reduce ? 0 : 0.05 + i * 0.03 }}
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
