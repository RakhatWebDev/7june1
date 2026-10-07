import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'
import { motion } from 'motion/react'
import { TONE_BG, TONE_VAR, toneTint, useReduceMotion, type Tone } from '../../components/ui/helpers'
import { MOOD_EMOJI, MOOD_LABEL, MOOD_VALUES, type MoodValue } from './calc'
import { textareaClass } from './styles'

/**
 * Five emoji buttons (😞…😄); the chosen one springs up inside a violet ring, the others dim.
 * Tapping the selected one keeps it selected. `sm` is the compact strip used on «Сегодня».
 */
export function MoodPicker({
  value,
  onChange,
  size = 'lg',
}: {
  value: MoodValue | null
  onChange: (v: MoodValue) => void
  size?: 'sm' | 'md' | 'lg'
}) {
  const reduce = useReduceMotion()
  const box =
    size === 'lg'
      ? 'h-16 rounded-2xl text-[34px]'
      : size === 'md'
        ? 'h-11 rounded-2xl text-2xl'
        : 'size-9 rounded-xl text-lg sm:size-10 sm:text-xl'
  return (
    <div role="group" aria-label="Настроение" className={size === 'sm' ? 'flex shrink-0 gap-1' : 'grid grid-cols-5 gap-2'}>
      {MOOD_VALUES.map((v) => {
        const active = value === v
        return (
          <motion.button
            key={v}
            type="button"
            aria-label={`Настроение: ${MOOD_LABEL[v - 1]}`}
            aria-pressed={active}
            onClick={() => onChange(v)}
            whileTap={reduce ? undefined : { scale: 0.86 }}
            whileHover={reduce || active ? undefined : { y: -2 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className={`relative flex items-center justify-center border transition-[background-color,border-color,opacity] duration-200 ${box} ${
              active
                ? 'border-violet/70 bg-violet/15 shadow-[0_8px_22px_-12px_var(--color-violet)]'
                : value == null
                  ? 'border-white/[0.06] bg-surface-2 hover:border-violet/40'
                  : 'border-white/[0.06] bg-surface-2 opacity-45 hover:opacity-100'
            }`}
          >
            <motion.span
              aria-hidden
              className="leading-none"
              initial={false}
              animate={reduce ? undefined : { scale: active ? 1.16 : 1, rotate: active ? [0, -8, 6, 0] : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 12 }}
            >
              {MOOD_EMOJI[v - 1]}
            </motion.span>
          </motion.button>
        )
      })}
    </div>
  )
}

/** 1–5 scale of dots that fill up to the chosen value (staggered pop); tapping the current value clears it. */
export function DotScale({
  label,
  value,
  onChange,
  low,
  high,
  tone = 'violet',
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  low: string
  high: string
  tone?: Tone
}) {
  const reduce = useReduceMotion()
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: value ? TONE_VAR[tone] : undefined }}>
          {value ? `${value}/5` : '—'}
        </span>
      </div>
      <div role="group" aria-label={label}>
        <div className="flex justify-between gap-1">
          {[1, 2, 3, 4, 5].map((v) => {
            const filled = value != null && v <= value
            return (
              <button
                key={v}
                type="button"
                aria-label={`${label}: ${v} из 5`}
                aria-pressed={value === v}
                onClick={() => onChange(value === v ? null : v)}
                className="grid size-11 place-items-center rounded-full transition-transform active:scale-90 motion-reduce:active:scale-100"
              >
                <span
                  aria-hidden
                  className="relative grid size-8 place-items-center rounded-full border-2 transition-[border-color] duration-200"
                  style={{ borderColor: filled ? TONE_VAR[tone] : toneTint(tone, 22) }}
                >
                  <motion.span
                    className={`absolute inset-[3px] rounded-full ${TONE_BG[tone]}`}
                    initial={false}
                    animate={{ scale: filled ? 1 : 0, opacity: filled ? 1 : 0 }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 20, delay: filled ? (v - 1) * 0.035 : 0 }
                    }
                  />
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-0.5 flex justify-between px-1 text-[11px] text-muted">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      </div>
    </div>
  )
}

/** Textarea that grows with its content. */
export function AutoTextarea({ className = '', value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={ref} rows={3} value={value} className={`${textareaClass} ${className}`} {...rest} />
}
