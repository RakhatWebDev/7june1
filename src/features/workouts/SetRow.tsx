import { useState } from 'react'
import { useAnimate } from 'motion/react'
import { Stepper } from '../../components/ui'
import { Icon } from '../../components/icons'
import { useReduceMotion } from '../../components/ui/helpers'
import type { SetLog } from '../../db/types'

const sig = (s: SetLog) => `${s.weightKg}|${s.reps}|${s.rpe ?? ''}|${s.done}`

/**
 * One set: № · weight (step 2.5) · reps · RPE (optional) · done.
 * Keeps a local copy so typing stays responsive while the write round-trips through IndexedDB;
 * external changes (e.g. "repeat last weight") are adopted when no local write is in flight.
 * Marking a set done flashes the row lime and gives it a tiny squeeze (transform/opacity only).
 */
export function SetRow({
  index,
  set,
  onChange,
  onDelete,
}: {
  index: number
  set: SetLog
  onChange: (patch: Partial<SetLog>) => Promise<unknown>
  onDelete: () => void
}) {
  const reduce = useReduceMotion()
  const [scope, animate] = useAnimate<HTMLLIElement>()
  const [local, setLocal] = useState<SetLog>(set)
  const [prevSig, setPrevSig] = useState(() => sig(set))
  const [pending, setPending] = useState(0)

  const incoming = sig(set)
  if (incoming !== prevSig) {
    setPrevSig(incoming)
    // While our own writes are in flight, incoming values are just (possibly stale) echoes.
    if (pending === 0) setLocal(set)
  }

  const change = (patch: Partial<SetLog>) => {
    if (patch.done === true && !local.done && !reduce && scope.current) {
      void animate(scope.current, { scale: [1, 0.98, 1] }, { duration: 0.28, ease: 'easeOut' })
      void animate('[data-flash]', { opacity: [0, 1, 0] }, { duration: 0.65, ease: 'easeOut' })
    }
    setLocal((l) => ({ ...l, ...patch }))
    setPending((p) => p + 1)
    void onChange(patch).finally(() => setPending((p) => p - 1))
  }

  const n = index + 1
  return (
    <li
      ref={scope}
      className={`relative -mx-1.5 flex flex-wrap items-center gap-2 rounded-2xl px-1.5 py-2.5 transition-colors duration-300 sm:flex-nowrap sm:gap-3 ${
        local.done ? 'bg-accent/[0.08]' : ''
      }`}
    >
      <span
        aria-hidden
        data-flash
        className="pointer-events-none absolute inset-0 rounded-2xl bg-accent/25 opacity-0 ring-1 ring-accent/60"
      />
      <span
        className={`relative order-3 grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors sm:order-1 ${
          local.done ? 'bg-accent text-bg' : 'bg-surface-3 text-muted'
        }`}
      >
        {n}
      </span>
      <div className="relative order-1 sm:order-2 [&_input]:w-14 sm:[&_input]:w-16">
        <Stepper
          aria-label={`Вес, подход ${n}`}
          value={local.weightKg}
          step={2.5}
          onChange={(v) => change({ weightKg: v })}
        />
      </div>
      <div className="relative order-2 sm:order-3 [&_input]:w-14 sm:[&_input]:w-16">
        <Stepper aria-label={`Повторы, подход ${n}`} value={local.reps} onChange={(v) => change({ reps: v })} />
      </div>
      <div className="relative order-4 ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
          RPE
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={10}
            step={0.5}
            aria-label={`RPE, подход ${n}`}
            className="h-9 w-12 rounded-xl border border-border bg-surface-2 px-1 text-center text-sm text-text tabular-nums focus:border-accent/70 focus:ring-2 focus:ring-accent/20 focus:outline-none"
            value={local.rpe ?? ''}
            onChange={(e) =>
              change({ rpe: e.target.value === '' ? null : Math.min(10, Math.max(1, Number(e.target.value))) })
            }
          />
        </label>
        <label className="relative grid size-10 cursor-pointer place-items-center">
          <input
            type="checkbox"
            className="peer size-10 cursor-pointer appearance-none rounded-xl border border-border bg-surface-2 transition-[background-color,border-color,transform] duration-150 checked:border-accent checked:bg-accent focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-90 motion-reduce:active:scale-100"
            aria-label={`Готово, подход ${n}`}
            checked={local.done}
            onChange={(e) => change({ done: e.target.checked })}
          />
          <Icon
            name="check"
            size={22}
            strokeWidth={2.5}
            className="pointer-events-none absolute text-muted/40 transition-colors peer-checked:text-bg"
          />
        </label>
        <button
          type="button"
          aria-label={`Удалить подход ${n}`}
          className="grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-danger/15 hover:text-danger"
          onClick={onDelete}
        >
          <Icon name="x" size={18} />
        </button>
      </div>
    </li>
  )
}
