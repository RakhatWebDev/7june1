import { useId, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { IconBadge, TONE_TEXT } from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import { Icon } from '../../components/icons'
import type { Insight } from './insights'
import { KIND_META } from './meta'

/**
 * One insight: tinted icon, title, body, optional action link, "почему" (evidence) disclosure
 * and a "hide for today" button.
 */
export function InsightItem({
  insight,
  onDismiss,
  onRestore,
  showEvidence = false,
  compact = false,
  dimmed = false,
}: {
  insight: Insight
  onDismiss?: () => void
  onRestore?: () => void
  /** Show the "Почему?" disclosure */
  showEvidence?: boolean
  compact?: boolean
  dimmed?: boolean
}) {
  const meta = KIND_META[insight.kind]
  const [open, setOpen] = useState(false)
  const reduce = useReduceMotion()
  const evidenceId = useId()
  return (
    <article
      className={`flex gap-3 ${compact ? '' : 'rounded-2xl border border-white/[0.06] bg-surface-2/60 p-3'} ${dimmed ? 'opacity-55' : ''}`}
      data-testid="insight"
      data-rule={insight.rule}
    >
      <IconBadge name={meta.icon} tone={meta.tone} size={compact ? 'sm' : 'md'} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-[15px] leading-snug font-semibold tracking-tight break-words">
            {insight.priority === 1 && (
              <span className={`mr-1.5 inline-block size-1.5 -translate-y-0.5 rounded-full bg-current ${TONE_TEXT[meta.tone]}`} aria-label="Важно" />
            )}
            {insight.title}
          </h3>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Скрыть на сегодня"
              title="Скрыть на сегодня"
              className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-text"
            >
              <Icon name="x" size={16} />
            </button>
          )}
          {onRestore && (
            <button
              type="button"
              onClick={onRestore}
              className="-mt-0.5 shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-surface-3 hover:text-text"
            >
              Вернуть
            </button>
          )}
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-muted break-words">{insight.body}</p>
        {(insight.action || (showEvidence && insight.evidence.length > 0)) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {insight.action && (
              <Link
                to={insight.action.to}
                className={`inline-flex min-h-8 items-center gap-1 rounded-full bg-surface-3/70 px-3 text-xs font-semibold transition-colors hover:bg-surface-3 ${TONE_TEXT[meta.tone]}`}
              >
                {insight.action.label}
                <Icon name="chevron-right" size={14} />
              </Link>
            )}
            {showEvidence && insight.evidence.length > 0 && (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={evidenceId}
                onClick={() => setOpen((o) => !o)}
                className="inline-flex min-h-8 items-center gap-1 rounded-full px-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
              >
                <Icon name="info" size={14} />
                Почему?
                <Icon
                  name="chevron-down"
                  size={14}
                  className={`transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>
        )}
        <AnimatePresence initial={false}>
          {showEvidence && open && (
            <motion.div
              id={evidenceId}
              key="evidence"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <ul className="mt-2 space-y-1 border-l-2 border-white/[0.08] pl-3" aria-label="На чём основан совет">
                {insight.evidence.map((e) => (
                  <li key={e} className="text-xs leading-relaxed text-muted tabular-nums break-words">
                    {e}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </article>
  )
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 motion-reduce:transition-none ${
        checked ? 'border-transparent bg-accent' : 'border-border bg-surface-3'
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 left-0.5 size-[22px] rounded-full shadow transition-transform duration-200 motion-reduce:transition-none ${
          checked ? 'translate-x-5 bg-bg' : 'translate-x-0 bg-muted'
        }`}
      />
    </button>
  )
}
