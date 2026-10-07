import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/icons'
import { motion } from 'motion/react'
import {
  Button,
  Field,
  Input,
  SegmentedControl,
  SegmentedNav,
  TONE_BG,
  TONE_TEXT,
  type Tone,
} from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import type { ISODate, TxCategory, TxKind } from '../../db/types'
import { today } from '../../lib/dates'
import { CURRENCY_SYMBOL, KIND_RU, budgetUsage, formatMoney, parseAmount, type BudgetLevel, type Currency } from './calc'

export const linkBtn =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-bg shadow-[0_10px_24px_-14px_rgb(180_240_60/0.8)] transition-[background-color,transform] hover:bg-accent-strong active:scale-[0.97] motion-reduce:active:scale-100'
export const linkBtnSecondary =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.05] bg-surface-2 px-4 text-sm font-medium text-text transition-[background-color,transform] hover:bg-surface-3 active:scale-[0.97] motion-reduce:active:scale-100'

const EASE_OUT = [0.22, 1, 0.36, 1] as const

/** Budget level → colour tone: warn > 80 %, danger > 100 %. */
export const LEVEL_TONE: Record<BudgetLevel, Tone> = { ok: 'accent', warn: 'warn', danger: 'danger' }
const LEVEL_TEXT: Record<BudgetLevel, string> = { ok: 'text-muted', warn: 'text-warn', danger: 'text-danger' }

/**
 * Thin progress bar whose fill grows in with `scaleX` (transform-only, 600 ms) — used where the
 * bar itself must carry extra attributes (`data-level`) that the shared `Progress` does not forward.
 */
export function ToneBar({
  value,
  tone = 'accent',
  label,
  delay = 0,
  className = 'h-2',
  attrs,
}: {
  value: number
  tone?: Tone
  label?: string
  delay?: number
  className?: string
  attrs?: Record<`data-${string}`, string>
}) {
  const reduce = useReduceMotion()
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const fill = `h-full w-full origin-left rounded-full ${TONE_BG[tone]}`
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-surface-3/70 ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      {...attrs}
    >
      {reduce ? (
        <div className={fill} style={{ transform: `scaleX(${v})` }} />
      ) : (
        <motion.div
          className={fill}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: v }}
          transition={{ duration: 0.6, delay, ease: EASE_OUT }}
        />
      )}
    </div>
  )
}

/** Spent / limit bar coloured by level: warn > 80 %, danger > 100 %. */
export function BudgetBar({
  spent,
  limit,
  currency,
  label,
  delay,
}: {
  spent: number
  limit: number
  currency: Currency
  label?: string
  delay?: number
}) {
  const { pct, level } = budgetUsage(spent, limit)
  return (
    <div>
      <ToneBar
        value={pct / 100}
        tone={LEVEL_TONE[level]}
        label={label}
        delay={delay}
        attrs={{ 'data-level': level }}
      />
      <div className={`mt-1.5 flex justify-between gap-2 text-xs tabular-nums ${LEVEL_TEXT[level]}`}>
        <span className="min-w-0 truncate">
          {formatMoney(spent, currency)} из {formatMoney(limit, currency)}
        </span>
        <span className="shrink-0 font-semibold">{Math.round(pct)}%</span>
      </div>
    </div>
  )
}

/** Sub-navigation between finance screens. */
export function FinanceNav() {
  return (
    <SegmentedNav
      aria-label="Разделы финансов"
      items={[
        { to: '/finance', label: 'Обзор' },
        { to: '/finance/budgets', label: 'Бюджеты' },
        { to: '/finance/recurring', label: 'Подписки' },
        { to: '/finance/savings', label: 'Накопления' },
      ]}
    />
  )
}

/** User-chosen category emoji in a soft round badge (emoji stay: categories are user-facing). */
export function EmojiBadge({
  emoji,
  tone = 'amber',
  size = 'md',
}: {
  emoji: ReactNode
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
}) {
  const box = size === 'sm' ? 'size-8 text-base' : size === 'lg' ? 'size-12 text-2xl' : 'size-10 text-xl'
  const bg: Record<Tone, string> = {
    accent: 'bg-accent/12',
    info: 'bg-info/12',
    warn: 'bg-warn/12',
    violet: 'bg-violet/12',
    pink: 'bg-pink/12',
    amber: 'bg-amber/12',
    danger: 'bg-danger/12',
    muted: 'bg-surface-3',
  }
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full leading-none ring-1 ring-white/[0.06] ${bg[tone]} ${box}`}
    >
      {emoji}
    </span>
  )
}

/** Icon grid for picking a category; tiles press in with a spring. */
export function CategoryGrid({
  categories,
  value,
  onChange,
  tone = 'amber',
}: {
  categories: TxCategory[]
  value: string
  onChange: (id: string) => void
  tone?: Tone
}) {
  const reduce = useReduceMotion()
  const activeRing: Record<Tone, string> = {
    accent: 'border-accent/60 bg-accent/12',
    amber: 'border-amber/60 bg-amber/12',
    info: 'border-info/60 bg-info/12',
    warn: 'border-warn/60 bg-warn/12',
    violet: 'border-violet/60 bg-violet/12',
    pink: 'border-pink/60 bg-pink/12',
    danger: 'border-danger/60 bg-danger/12',
    muted: 'border-border bg-surface-3',
  }
  return (
    <div role="group" aria-label="Категория" className="grid grid-cols-4 gap-2">
      {categories.map((c) => {
        const active = c.id === value
        return (
          <motion.button
            key={c.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(c.id)}
            whileTap={reduce ? undefined : { scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            className={`flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border px-1 py-2 text-center transition-colors ${
              active ? `${activeRing[tone]} text-text` : 'border-white/[0.05] bg-surface-2 text-muted hover:text-text'
            }`}
          >
            <span
              aria-hidden
              className={`grid size-9 place-items-center rounded-full text-xl leading-none transition-transform duration-200 ${
                active ? 'scale-110 bg-white/[0.06]' : 'bg-surface-3/60'
              }`}
            >
              {c.icon}
            </span>
            <span className="w-full truncate text-[11px] leading-tight font-medium">{c.name}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

/** Big amount input — the hero of every money form: huge tabular number, currency symbol, decimal keyboard. */
export function AmountInput({
  value,
  onChange,
  currency,
  autoFocus,
  label = 'Сумма',
  tone = 'amber',
}: {
  value: string
  onChange: (v: string) => void
  currency: Currency
  autoFocus?: boolean
  label?: string
  tone?: Tone
}) {
  const focus: Record<Tone, string> = {
    accent: 'focus-within:border-accent/60',
    amber: 'focus-within:border-amber/60',
    info: 'focus-within:border-info/60',
    warn: 'focus-within:border-warn/60',
    violet: 'focus-within:border-violet/60',
    pink: 'focus-within:border-pink/60',
    danger: 'focus-within:border-danger/60',
    muted: 'focus-within:border-border',
  }
  // Width follows the typed text (digits are 1ch with tabular-nums) so number + symbol stay centred.
  const width = `${Math.max(1, value.length) + 0.4}ch`
  return (
    <div
      className={`flex min-h-24 items-baseline justify-center gap-2 overflow-hidden rounded-3xl border border-white/[0.06] bg-surface-2 bg-[image:var(--gradient-elevated)] px-4 py-5 transition-colors ${focus[tone]}`}
    >
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        placeholder="0"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,\s]/g, ''))}
        style={{ width, maxWidth: '100%' }}
        className="min-w-0 bg-transparent text-center text-5xl leading-none font-bold tracking-tight tabular-nums text-text caret-current placeholder:text-muted/50 focus:outline-none"
      />
      <span className={`shrink-0 text-3xl font-semibold ${TONE_TEXT[tone]}`}>{CURRENCY_SYMBOL[currency]}</span>
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
  const tone: Tone = kind === 'income' ? 'accent' : 'amber'

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
      <SegmentedControl
        aria-label="Тип операции"
        value={kind}
        onChange={switchKind}
        options={[
          { value: 'expense', label: KIND_RU.expense, icon: 'minus' },
          { value: 'income', label: KIND_RU.income, icon: 'plus' },
        ]}
      />
      <AmountInput value={amount} onChange={setAmount} currency={currency} autoFocus={autoFocus} tone={tone} />
      <div>
        <p className="mb-2 px-0.5 text-xs font-medium tracking-wide text-muted uppercase">Категория</p>
        <CategoryGrid categories={list} value={effectiveCategory} onChange={setCategoryId} tone={tone} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
        </Field>
        <Field label="Заметка">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="необязательно" maxLength={120} />
        </Field>
      </div>
      <Button type="submit" size="lg" icon="check" className="w-full" disabled={!valid}>
        {submitLabel}
      </Button>
      {extra}
    </form>
  )
}

/** Small heading inside a card, with an optional trailing action. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
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

/** `CountUp` formatter for money: whole numbers while counting, the exact amount at the end. */
export function moneyCounter(target: number, currency: Currency) {
  return (v: number) => formatMoney(Math.abs(v - target) < 0.005 ? target : Math.round(v), currency)
}

/** Compact «‹ label ›» pill for stepping through days/months. */
export function PeriodSwitcher({
  label,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  reset,
  testId,
}: {
  label: ReactNode
  prevLabel: string
  nextLabel: string
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
        <button type="button" aria-label={prevLabel} className={btn} onClick={onPrev}>
          <Icon name="chevron-left" size={18} />
        </button>
        <div className="min-w-32 truncate px-1 text-center text-sm font-semibold first-letter:uppercase" data-testid={testId}>
          {label}
        </div>
        <button type="button" aria-label={nextLabel} className={btn} onClick={onNext}>
          <Icon name="chevron-right" size={18} />
        </button>
      </div>
      {reset}
    </div>
  )
}
