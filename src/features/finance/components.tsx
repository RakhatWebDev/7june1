import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { Button, Chip, Field, Input } from '../../components/ui'
import type { ISODate, TxCategory, TxKind } from '../../db/types'
import { today } from '../../lib/dates'
import { CURRENCY_SYMBOL, KIND_RU, budgetUsage, formatMoney, parseAmount, type BudgetLevel, type Currency } from './calc'

export const linkBtn =
  'inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-strong'
export const linkBtnSecondary =
  'inline-flex items-center justify-center rounded-xl bg-surface-2 px-4 py-2 text-sm text-text hover:bg-border'

const LEVEL_BG: Record<BudgetLevel, string> = { ok: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger' }
const LEVEL_TEXT: Record<BudgetLevel, string> = { ok: 'text-muted', warn: 'text-warn', danger: 'text-danger' }

/** Spent / limit bar coloured by level: warn > 80 %, danger > 100 %. */
export function BudgetBar({ spent, limit, currency, label }: { spent: number; limit: number; currency: Currency; label?: string }) {
  const { pct, level } = budgetUsage(spent, limit)
  return (
    <div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(pct))}
        data-level={level}
      >
        <div className={`h-full rounded-full transition-all ${LEVEL_BG[level]}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className={`mt-1 flex justify-between gap-2 text-xs tabular-nums ${LEVEL_TEXT[level]}`}>
        <span>
          {formatMoney(spent, currency)} из {formatMoney(limit, currency)}
        </span>
        <span>{Math.round(pct)}%</span>
      </div>
    </div>
  )
}

/** Sub-navigation between finance screens. */
export function FinanceNav() {
  const items = [
    { to: '/finance', label: 'Обзор', end: true },
    { to: '/finance/budgets', label: 'Бюджеты' },
    { to: '/finance/recurring', label: 'Подписки' },
    { to: '/finance/savings', label: 'Накопления' },
  ]
  return (
    <nav aria-label="Разделы финансов" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          className={({ isActive }) =>
            `shrink-0 rounded-full border px-3 py-1.5 text-sm ${
              isActive ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2 text-muted hover:text-text'
            }`
          }
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Icon grid for picking a category. */
export function CategoryGrid({
  categories,
  value,
  onChange,
}: {
  categories: TxCategory[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div role="group" aria-label="Категория" className="grid grid-cols-4 gap-2">
      {categories.map((c) => {
        const active = c.id === value
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(c.id)}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center transition ${
              active ? 'border-accent bg-accent/15 text-text' : 'border-border bg-surface-2 text-muted hover:text-text'
            }`}
          >
            <span className="text-2xl leading-none" aria-hidden>
              {c.icon}
            </span>
            <span className="w-full truncate text-[11px] leading-tight">{c.name}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Big amount input with the decimal keyboard on mobile. */
export function AmountInput({
  value,
  onChange,
  currency,
  autoFocus,
  label = 'Сумма',
}: {
  value: string
  onChange: (v: string) => void
  currency: Currency
  autoFocus?: boolean
  label?: string
}) {
  return (
    <div className="flex items-baseline gap-2 rounded-2xl border border-border bg-surface-2 px-4 py-3 focus-within:border-accent">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        placeholder="0"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,\s]/g, ''))}
        className="w-full min-w-0 bg-transparent text-4xl font-bold tabular-nums text-text placeholder:text-muted focus:outline-none"
      />
      <span className="text-2xl text-muted">{CURRENCY_SYMBOL[currency]}</span>
    </div>
  )
}

export interface TxFormValues {
  kind: TxKind
  amount: number
  categoryId: string
  date: ISODate
  note: string
}

/** Transaction form shared by the "new" page and the edit sheet. */
export function TxForm({
  initial,
  categories,
  currency,
  onSubmit,
  submitLabel = 'Сохранить',
  autoFocus,
  extra,
  defaultCategory,
}: {
  initial: { kind: TxKind; amount?: number; categoryId?: string; date?: ISODate; note?: string }
  categories: TxCategory[]
  currency: Currency
  onSubmit: (v: TxFormValues) => void | Promise<void>
  submitLabel?: string
  autoFocus?: boolean
  extra?: ReactNode
  /** Picks a default category for a kind when none is chosen yet */
  defaultCategory?: (kind: TxKind) => string | undefined
}) {
  const [kind, setKind] = useState<TxKind>(initial.kind)
  const [amount, setAmount] = useState(initial.amount != null ? String(initial.amount).replace('.', ',') : '')
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? '')
  const [date, setDate] = useState(initial.date ?? today())
  const [note, setNote] = useState(initial.note ?? '')

  const list = categories.filter((c) => c.kind === kind)
  // Fall back to the suggested category until the user taps one explicitly.
  const effectiveCategory = list.some((c) => c.id === categoryId) ? categoryId : (defaultCategory?.(kind) ?? '')
  const parsed = parseAmount(amount)
  const valid = parsed != null && !!effectiveCategory && !!date

  function switchKind(k: TxKind) {
    if (k === kind) return
    setKind(k)
    setCategoryId('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || parsed == null) return
    await onSubmit({ kind, amount: parsed, categoryId: effectiveCategory, date, note: note.trim() })
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="Тип операции">
        {(['expense', 'income'] as TxKind[]).map((k) => (
          <Chip key={k} active={kind === k} onClick={() => switchKind(k)}>
            {KIND_RU[k]}
          </Chip>
        ))}
      </div>
      <AmountInput value={amount} onChange={setAmount} currency={currency} autoFocus={autoFocus} />
      <CategoryGrid categories={list} value={effectiveCategory} onChange={setCategoryId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
        </Field>
        <Field label="Заметка">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="необязательно" maxLength={120} />
        </Field>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={!valid}>
        {submitLabel}
      </Button>
      {extra}
    </form>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium text-muted">{children}</h2>
      {action}
    </div>
  )
}

export function AddLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={linkBtn}>
      {children}
    </Link>
  )
}
