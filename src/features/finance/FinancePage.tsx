import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Button,
  Card,
  CountUp,
  EmptyState,
  Field,
  IconBadge,
  LinkButton,
  PageHeader,
  SectionHeader,
  Select,
  Sheet,
  StaggerList,
  StatTile,
} from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
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
import { EmojiBadge, FinanceNav, PeriodSwitcher, ToneBar, TxForm, moneyCounter } from './components'
import { useCategories, useCurrency, useFinanceSeed } from './hooks'

const AXIS_TICK = { fill: 'var(--color-muted)', fontSize: 11 }
const GRID = 'var(--color-border)'
const TOOLTIP = {
  contentStyle: {
    background: 'color-mix(in srgb, var(--color-surface-2) 92%, transparent)',
    border: '1px solid rgb(255 255 255 / 0.08)',
    borderRadius: 14,
    boxShadow: 'var(--shadow-float)',
    backdropFilter: 'blur(12px)',
    color: 'var(--color-text)',
    fontSize: 12,
    padding: '8px 12px',
  },
  labelStyle: { color: 'var(--color-muted)', marginBottom: 2 },
  itemStyle: { color: 'var(--color-text)', fontWeight: 600, padding: 0 },
  cursor: { fill: 'rgb(255 255 255 / 0.04)' },
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
  const reduce = useReduceMotion()
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
  const todayISO = today()
  const negative = totals.balance < 0
  const overspent = perDay != null && perDay < 0

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
      <PageHeader title="Финансы" back="/growth" />
      <FinanceNav />

      <PeriodSwitcher
        label={monthLabel(month)}
        testId="finance-month"
        prevLabel="Предыдущий месяц"
        nextLabel="Следующий месяц"
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        reset={
          month !== current && (
            <button
              type="button"
              className="min-h-9 rounded-full bg-amber/15 px-3 text-xs font-medium text-amber transition-transform active:scale-95 motion-reduce:active:scale-100"
              onClick={() => setParams({}, { replace: true })}
            >
              к текущему
            </button>
          )
        }
      />

      <section aria-label="Сводка месяца" className="space-y-3">
        <Card variant="accent" tone={negative ? 'danger' : 'amber'} className="p-5">
          <div className="flex items-center gap-2.5">
            <IconBadge name="wallet" tone={negative ? 'danger' : 'amber'} size="sm" />
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Баланс месяца</h2>
          </div>
          <div
            className={`mt-3 text-[40px] leading-none font-bold tracking-tight ${negative ? 'text-danger' : 'text-text'}`}
          >
            <CountUp value={totals.balance} format={moneyCounter(totals.balance, currency)} />
          </div>
          <p className="mt-2 text-sm text-muted">
            Доходы минус расходы
            {month === current && daysLeft > 0 ? ` · до конца месяца ${daysLeft} дн.` : ''}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <LinkButton to="/finance/new?kind=expense" icon="minus" className="w-full">
              Расход
            </LinkButton>
            <LinkButton to="/finance/new?kind=income" variant="secondary" icon="plus" className="w-full">
              Доход
            </LinkButton>
          </div>
        </Card>

        <StaggerList className="grid grid-cols-2 gap-3" itemClassName="last:col-span-2 *:h-full" delay={0.08}>
          <StatTile
            key="income"
            icon="plus"
            tone="accent"
            label="Доходы"
            value={
              <span className="text-[19px] text-accent">
                <CountUp value={totals.income} format={moneyCounter(totals.income, currency)} />
              </span>
            }
          />
          <StatTile
            key="expense"
            icon="minus"
            tone="danger"
            label="Расходы"
            value={
              <span className="text-[19px]">
                <CountUp value={totals.expense} format={moneyCounter(totals.expense, currency)} />
              </span>
            }
          />
          <StatTile
            key="allowance"
            icon="calendar"
            tone={overspent ? 'danger' : 'amber'}
            label="Можно тратить в день"
            value={
              <span data-testid="daily-allowance" className={overspent ? 'text-danger' : ''}>
                {perDay != null ? fmt(Math.max(0, perDay)) : '—'}
              </span>
            }
            sub={
              budget <= 0
                ? 'задайте бюджет или доход'
                : daysLeft <= 0
                  ? 'месяц завершён'
                  : overspent
                    ? `перерасход ${fmt(totals.expense - budget)}`
                    : `${daysLeft} дн. · бюджет ${fmt(budget)}`
            }
          />
        </StaggerList>
      </section>

      <SectionHeader
        title="Расходы по дням"
        icon="chart"
        tone="amber"
        action={totals.expense > 0 && <span className="text-xs text-muted tabular-nums">{fmt(totals.expense)}</span>}
      />
      <Card>
        {totals.expense === 0 ? (
          <p className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted">
            <IconBadge name="chart" tone="muted" />
            Расходов в этом месяце нет
          </p>
        ) : (
          <div className="h-44 w-full" data-testid="finance-daily-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={AXIS_TICK}
                  stroke={GRID}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={8}
                />
                <YAxis tick={AXIS_TICK} stroke={GRID} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
                <Tooltip
                  {...TOOLTIP}
                  labelFormatter={(l) => `${l} ${MONTHS_GEN[Number(month.slice(5, 7)) - 1]}`}
                  formatter={(v) => [fmt(Number(v)), 'Расходы']}
                />
                <Bar
                  dataKey="amount"
                  radius={[5, 5, 2, 2]}
                  maxBarSize={14}
                  isAnimationActive={!reduce}
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {daily.map((d) => (
                    <Cell
                      key={d.date}
                      fill="var(--color-amber)"
                      fillOpacity={d.date === todayISO ? 1 : 0.55}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {slices.length > 0 && (
        <>
          <SectionHeader title="По категориям" icon="list" tone="amber" />
          <Card>
            <ul className="space-y-3.5" aria-label="Расходы по категориям">
              {slices.map((s, i) => (
                <li key={s.categoryId} className="flex items-center gap-3">
                  <EmojiBadge emoji={s.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-baseline gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                      <span className="text-xs text-muted tabular-nums">{s.pct}%</span>
                      <span className="font-semibold tabular-nums">{fmt(s.amount)}</span>
                    </div>
                    <ToneBar value={s.pct / 100} tone="amber" className="h-1.5" delay={0.05 * Math.min(i, 8)} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <SectionHeader title="Операции" icon="history" tone="amber" />
      {txs && groups.length === 0 ? (
        <EmptyState
          icon="wallet"
          tone="amber"
          title="Операций за месяц нет"
          hint="Добавьте расход или доход — займёт пару секунд."
          action={
            <LinkButton to="/finance/new?kind=expense" icon="plus">
              Добавить расход
            </LinkButton>
          }
        />
      ) : (
        <StaggerList className="space-y-4">
          {groups.map((g) => (
            <section key={g.date} aria-label={dayLabel(g.date)}>
              <div className="mb-1.5 flex justify-between px-1 text-xs font-medium text-muted">
                <span>{dayLabel(g.date)}</span>
                <span className={`tabular-nums ${g.net > 0 ? 'text-accent' : ''}`}>{fmt(g.net)}</span>
              </div>
              <Card as="div" padding="none" className="overflow-hidden">
                <ul className="divide-y divide-white/[0.05]">
                  {g.items.map((t) => {
                    const c = catById.get(t.categoryId)
                    const income = t.kind === 'income'
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setEditing(t)}
                          className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
                          aria-label={`Операция ${c?.name ?? ''} ${fmt(t.amount)}`}
                        >
                          <EmojiBadge emoji={c?.icon ?? '📦'} tone={income ? 'accent' : 'amber'} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{c?.name ?? 'Без категории'}</span>
                            {t.note && <span className="block truncate text-xs text-muted">{t.note}</span>}
                          </span>
                          <span
                            className={`shrink-0 text-[15px] font-semibold tabular-nums ${income ? 'text-accent' : ''}`}
                          >
                            {income ? '+' : '−'}
                            {fmt(t.amount)}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </StaggerList>
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
              <Button variant="danger" icon="trash" className="w-full" onClick={() => void remove(editing)}>
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
    <Card className="mt-6 flex items-end gap-3">
      <IconBadge name="settings" tone="muted" className="mb-1" />
      <Field label="Валюта" className="flex-1">
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
    </Card>
  )
}
