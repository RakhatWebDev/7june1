import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card, EmptyState, Field, PageHeader, Select, Sheet, Stat } from '../../components/ui'
import { db } from '../../db'
import type { Transaction } from '../../db/types'
import { today } from '../../lib/dates'
import {
  CURRENCIES,
  CURRENCY_RU,
  CURRENCY_SETTING_KEY,
  MONTH_RE,
  categoryBreakdown,
  dailyAllowance,
  dailyExpenses,
  formatMoney,
  groupByDate,
  monthBudget,
  monthLabel,
  monthOf,
  monthRange,
  monthTotals,
  remainingDays,
  shiftMonth,
  type Currency,
} from './calc'
import { FinanceNav, SectionTitle, TxForm, linkBtn, linkBtnSecondary } from './components'
import { useCategories, useCurrency, useFinanceSeed } from './hooks'

const AXIS_TICK = { fill: 'var(--color-muted)', fontSize: 11 }
const GRID = 'var(--color-border)'
const TOOLTIP = {
  contentStyle: {
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    color: 'var(--color-text)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--color-muted)' },
  itemStyle: { color: 'var(--color-text)' },
  cursor: { fill: 'var(--color-surface-2)' },
}

/** "2026-10-07" → "7 окт" style label for the day list. */
const MONTHS_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
function dayLabel(iso: string): string {
  if (iso === today()) return 'Сегодня'
  return `${Number(iso.slice(8, 10))} ${MONTHS_GEN[Number(iso.slice(5, 7)) - 1]}`
}

/** Compact axis amounts: 12500 → "12,5k" */
function compact(n: number): string {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`
  if (n >= 1000) return `${Number((n / 1000).toFixed(1))}k`
  return String(Math.round(n))
}

/** Month overview: totals, daily allowance, daily chart, categories, operations. `?month=YYYY-MM`. */
export function FinancePage() {
  useFinanceSeed()
  const [params, setParams] = useSearchParams()
  const raw = params.get('month')
  const current = monthOf(today())
  const month = raw && MONTH_RE.test(raw) ? raw : current
  const { from, to } = monthRange(month)

  const currency = useCurrency()
  const categories = useCategories()
  const txs = useLiveQuery(() => db.transactions.where('date').between(from, to, true, true).toArray(), [from, to])
  const budgets = useLiveQuery(() => db.budgets.toArray(), [])
  const [editing, setEditing] = useState<Transaction | null>(null)

  const list = txs ?? []
  const totals = monthTotals(list, month)
  const budget = monthBudget(budgets ?? [], totals.income)
  const daysLeft = remainingDays(month, today())
  const perDay = dailyAllowance(budget, totals.expense, daysLeft)
  const daily = dailyExpenses(list, month)
  const slices = categoryBreakdown(list, categories ?? [], month, 'expense')
  const groups = groupByDate(list)
  const catById = new Map((categories ?? []).map((c) => [c.id, c]))
  const fmt = (n: number) => formatMoney(n, currency)

  const go = (delta: number) => {
    const next = shiftMonth(month, delta)
    setParams(next === current ? {} : { month: next }, { replace: true })
  }

  async function saveEdit(tx: Transaction, v: { kind: Transaction['kind']; amount: number; categoryId: string; date: string; note: string }) {
    await db.transactions.update(tx.id, { ...v, note: v.note || undefined })
    setEditing(null)
  }

  async function remove(tx: Transaction) {
    if (!window.confirm('Удалить операцию?')) return
    await db.transactions.delete(tx.id)
    setEditing(null)
  }

  return (
    <>
      <PageHeader
        title="Финансы"
        back="/growth"
        action={
          <Link to="/finance/new?kind=expense" className={linkBtn}>
            + Расход
          </Link>
        }
      />
      <FinanceNav />

      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" aria-label="Предыдущий месяц" onClick={() => go(-1)}>
          ←
        </Button>
        <div className="min-w-0 text-center">
          <div className="truncate font-semibold" data-testid="finance-month">
            {monthLabel(month)}
          </div>
          {month !== current && (
            <button type="button" className="text-xs text-accent" onClick={() => setParams({}, { replace: true })}>
              к текущему
            </button>
          )}
        </div>
        <Button variant="secondary" size="sm" aria-label="Следующий месяц" onClick={() => go(1)}>
          →
        </Button>
      </div>

      <section aria-label="Сводка месяца" className="mb-4 grid grid-cols-2 gap-2">
        <Stat label="Доходы" value={<span className="text-accent">{fmt(totals.income)}</span>} />
        <Stat label="Расходы" value={fmt(totals.expense)} />
        <Stat
          label="Баланс"
          value={<span className={totals.balance < 0 ? 'text-danger' : ''}>{fmt(totals.balance)}</span>}
        />
        <Stat
          label="Можно тратить в день"
          value={
            <span data-testid="daily-allowance" className={perDay != null && perDay < 0 ? 'text-danger' : ''}>
              {perDay != null ? fmt(Math.max(0, perDay)) : '—'}
            </span>
          }
          sub={
            budget <= 0
              ? 'задайте бюджет или доход'
              : daysLeft <= 0
                ? 'месяц завершён'
                : perDay != null && perDay < 0
                  ? `перерасход ${fmt(totals.expense - budget)}`
                  : `${daysLeft} дн. · бюджет ${fmt(budget)}`
          }
        />
      </section>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Link to="/finance/new?kind=expense" className={linkBtnSecondary}>
          − Расход
        </Link>
        <Link to="/finance/new?kind=income" className={linkBtnSecondary}>
          + Доход
        </Link>
      </div>

      <Card className="mb-4">
        <SectionTitle>Расходы по дням</SectionTitle>
        {totals.expense === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Расходов в этом месяце нет</p>
        ) : (
          <div className="h-44 w-full" data-testid="finance-daily-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={AXIS_TICK} stroke={GRID} interval="preserveStartEnd" minTickGap={8} />
                <YAxis tick={AXIS_TICK} stroke={GRID} tickFormatter={compact} width={48} />
                <Tooltip
                  {...TOOLTIP}
                  labelFormatter={(l) => `${l} ${MONTHS_GEN[Number(month.slice(5, 7)) - 1]}`}
                  formatter={(v) => [fmt(Number(v)), 'Расходы']}
                />
                <Bar dataKey="amount" fill="var(--color-accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {slices.length > 0 && (
        <Card className="mb-4">
          <SectionTitle>По категориям</SectionTitle>
          <ul className="space-y-3" aria-label="Расходы по категориям">
            {slices.map((s) => (
              <li key={s.categoryId}>
                <div className="mb-1 flex items-baseline gap-2 text-sm">
                  <span aria-hidden>{s.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="text-xs text-muted tabular-nums">{s.pct}%</span>
                  <span className="font-medium tabular-nums">{fmt(s.amount)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${s.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SectionTitle>Операции</SectionTitle>
      {txs && groups.length === 0 ? (
        <EmptyState
          title="Операций за месяц нет"
          hint="Добавьте расход или доход — займёт пару секунд."
          action={
            <Link to="/finance/new?kind=expense" className={linkBtn}>
              Добавить расход
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.date} aria-label={dayLabel(g.date)}>
              <div className="mb-1 flex justify-between px-1 text-xs text-muted">
                <span>{dayLabel(g.date)}</span>
                <span className="tabular-nums">{fmt(g.net)}</span>
              </div>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {g.items.map((t) => {
                  const c = catById.get(t.categoryId)
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(t)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                        aria-label={`Операция ${c?.name ?? ''} ${fmt(t.amount)}`}
                      >
                        <span className="text-xl" aria-hidden>
                          {c?.icon ?? '📦'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{c?.name ?? 'Без категории'}</span>
                          {t.note && <span className="block truncate text-xs text-muted">{t.note}</span>}
                        </span>
                        <span
                          className={`shrink-0 font-medium tabular-nums ${t.kind === 'income' ? 'text-accent' : ''}`}
                        >
                          {t.kind === 'income' ? '+' : '−'}
                          {fmt(t.amount)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <CurrencyPicker currency={currency} />

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Операция">
        {editing && categories && (
          <TxForm
            key={editing.id}
            initial={editing}
            categories={categories}
            currency={currency}
            onSubmit={(v) => saveEdit(editing, v)}
            extra={
              <Button variant="danger" className="w-full" onClick={() => void remove(editing)}>
                Удалить
              </Button>
            }
          />
        )}
      </Sheet>
    </>
  )
}

function CurrencyPicker({ currency }: { currency: Currency }) {
  return (
    <div className="mt-6">
      <Field label="Валюта">
        <Select
          value={currency}
          onChange={(e) => void db.settings.put({ key: CURRENCY_SETTING_KEY, value: e.target.value })}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {CURRENCY_RU[c]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}
