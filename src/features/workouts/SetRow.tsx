import { useState } from 'react'
import { Stepper } from '../../components/ui'
import type { SetLog } from '../../db/types'

const sig = (s: SetLog) => `${s.weightKg}|${s.reps}|${s.rpe ?? ''}|${s.done}`

/**
 * One set: № · weight (step 2.5) · reps · RPE (optional) · done.
 * Keeps a local copy so typing stays responsive while the write round-trips through IndexedDB;
 * external changes (e.g. "repeat last weight") are adopted when no local write is in flight.
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
    setLocal((l) => ({ ...l, ...patch }))
    setPending((p) => p + 1)
    void onChange(patch).finally(() => setPending((p) => p - 1))
  }

  const n = index + 1
  return (
    <li
      className={`grid grid-cols-[1.25rem_1fr_1fr] items-center gap-x-1.5 gap-y-2 rounded-xl py-2 sm:grid-cols-[1.5rem_8.5rem_8.5rem_1fr] sm:gap-x-3 ${
        local.done ? 'bg-accent/10' : ''
      }`}
    >
      <span className={`text-center text-sm font-semibold ${local.done ? 'text-accent' : 'text-muted'}`}>{n}</span>
      <div className="w-fit">
        <Stepper
          aria-label={`Вес, подход ${n}`}
          value={local.weightKg}
          step={2.5}
          onChange={(v) => change({ weightKg: v })}
        />
      </div>
      <div className="w-fit">
        <Stepper aria-label={`Повторы, подход ${n}`} value={local.reps} onChange={(v) => change({ reps: v })} />
      </div>
      <div className="col-start-2 col-end-4 flex items-center justify-end gap-3 sm:col-start-auto sm:col-end-auto">
        <label className="flex items-center gap-1 text-xs text-muted">
          RPE
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={10}
            step={0.5}
            aria-label={`RPE, подход ${n}`}
            className="w-12 rounded-lg border border-border bg-surface-2 px-1 py-1 text-center text-sm text-text focus:border-accent focus:outline-none"
            value={local.rpe ?? ''}
            onChange={(e) => change({ rpe: e.target.value === '' ? null : Math.min(10, Math.max(1, Number(e.target.value))) })}
          />
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="h-6 w-6 accent-[var(--color-accent)]"
            aria-label={`Готово, подход ${n}`}
            checked={local.done}
            onChange={(e) => change({ done: e.target.checked })}
          />
          <span className={local.done ? 'text-accent' : 'text-muted'}>Готово</span>
        </label>
        <button
          type="button"
          aria-label={`Удалить подход ${n}`}
          className="rounded-lg px-2 py-1 text-muted hover:bg-danger/15 hover:text-danger"
          onClick={onDelete}
        >
          ✕
        </button>
      </div>
    </li>
  )
}
