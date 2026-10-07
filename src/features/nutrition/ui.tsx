import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Icon, SegmentedNav } from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'

const EASE_OUT = [0.22, 1, 0.36, 1] as const

/** Sub-navigation between the diary, the targets and the food library. */
export function NutritionNav() {
  return (
    <SegmentedNav
      aria-label="Разделы питания"
      items={[
        { to: '/nutrition', label: 'Дневник', icon: 'utensils' },
        { to: '/nutrition/plan', label: 'Норма', icon: 'target' },
        { to: '/nutrition/foods', label: 'Продукты', icon: 'apple' },
      ]}
    />
  )
}

/** Compact «‹ label ›» pill for stepping between days. */
export function DaySwitcher({
  label,
  onPrev,
  onNext,
  reset,
  testId,
}: {
  label: ReactNode
  onPrev: () => void
  onNext: () => void
  reset?: ReactNode
  testId?: string
}) {
  const btn =
    'grid size-9 shrink-0 place-items-center rounded-full text-muted transition-[color,background-color,transform] hover:bg-surface-3 hover:text-text active:scale-95 motion-reduce:active:scale-100'
  return (
    <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
      <div className="flex max-w-full min-w-0 items-center gap-1 rounded-full border border-white/[0.06] bg-surface-2/80 p-1">
        <button type="button" aria-label="Предыдущий день" className={btn} onClick={onPrev}>
          <Icon name="chevron-left" size={18} />
        </button>
        <div className="flex min-w-32 items-center justify-center gap-1.5 px-1 text-sm font-semibold">
          <Icon name="calendar" size={15} className="text-warn" />
          <span className="truncate first-letter:uppercase" data-testid={testId}>
            {label}
          </span>
        </div>
        <button type="button" aria-label="Следующий день" className={btn} onClick={onNext}>
          <Icon name="chevron-right" size={18} />
        </button>
      </div>
      {reset}
    </div>
  )
}

/**
 * `<li>` that fades up with a 40 ms stagger by `index` (capped at 10) — for lists that need their
 * own `<ul>` attributes (accessible name), which `StaggerList` does not forward.
 */
export function StaggerItem({
  index,
  children,
  className = '',
}: {
  index: number
  children: ReactNode
  className?: string
}) {
  const reduce = useReduceMotion()
  if (reduce) return <li className={className}>{children}</li>
  return (
    <motion.li
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE_OUT, delay: Math.min(index, 9) * 0.04 }}
    >
      {children}
    </motion.li>
  )
}
