import { useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { MOOD_EMOJI, MOOD_LABEL, MOOD_VALUES, type MoodValue } from './calc'
import { textareaClass } from './styles'

/** Five large emoji buttons (😞…😄); tapping the selected one keeps it selected. */
export function MoodPicker({
  value,
  onChange,
  size = 'lg',
}: {
  value: MoodValue | null
  onChange: (v: MoodValue) => void
  size?: 'md' | 'lg'
}) {
  const box = size === 'lg' ? 'h-14 text-3xl' : 'h-11 text-2xl'
  return (
    <div role="group" aria-label="Настроение" className="grid grid-cols-5 gap-2">
      {MOOD_VALUES.map((v) => {
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            aria-label={`Настроение: ${MOOD_LABEL[v - 1]}`}
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={`flex items-center justify-center rounded-2xl border transition motion-reduce:transition-none ${box} ${
              active
                ? 'scale-105 border-accent bg-accent/15'
                : value == null
                  ? 'border-border bg-surface-2 hover:border-accent/60'
                  : 'border-border bg-surface-2 opacity-50 hover:opacity-100'
            }`}
          >
            <span aria-hidden>{MOOD_EMOJI[v - 1]}</span>
          </button>
        )
      })}
    </div>
  )
}

/** 1–5 scale of circles; tapping the current value clears it. */
export function DotScale({
  label,
  value,
  onChange,
  low,
  high,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  low: string
  high: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
        <span className="text-xs text-muted tabular-nums">{value ? `${value}/5` : '—'}</span>
      </div>
      <div role="group" aria-label={label} className="flex items-center justify-between gap-2">
        <span className="w-14 text-[11px] text-muted">{low}</span>
        <div className="flex flex-1 justify-center gap-3">
          {[1, 2, 3, 4, 5].map((v) => {
            const filled = value != null && v <= value
            return (
              <button
                key={v}
                type="button"
                aria-label={`${label}: ${v} из 5`}
                aria-pressed={value === v}
                onClick={() => onChange(value === v ? null : v)}
                className="flex h-9 w-9 items-center justify-center rounded-full"
              >
                <span
                  className={`block h-6 w-6 rounded-full border-2 transition motion-reduce:transition-none ${
                    filled ? 'scale-110 border-accent bg-accent' : 'border-border bg-surface-2'
                  }`}
                />
              </button>
            )
          })}
        </div>
        <span className="w-14 text-right text-[11px] text-muted">{high}</span>
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

/** Large circular progress ring (SVG stroke-dashoffset) with content in the middle. */
export function TimerRing({
  progress,
  children,
}: {
  /** 0..1 elapsed */
  progress: number
  children: ReactNode
}) {
  const r = 46
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[18rem]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="4" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          className="transition-[stroke-dashoffset] duration-300 ease-linear motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}
