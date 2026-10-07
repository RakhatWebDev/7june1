import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Button,
  Card,
  CountUp,
  Field,
  Icon,
  IconBadge,
  PageHeader,
  SectionHeader,
  Sheet,
  StaggerList,
} from '../../components/ui'
import { db } from '../../db'
import type { TxCategory } from '../../db/types'
import { today } from '../../lib/dates'
import { budgetUsage, formatMoney, monthLabel, monthOf, monthRange, monthTotals, parseAmount, spentByCategory } from './calc'
import { AmountInput, BudgetBar, EmojiBadge, FinanceNav, LEVEL_TONE, moneyCounter } from './components'
import { setBudgetLimit } from './actions'
import { useCategories, useCurrency, useFinanceSeed } from './hooks'

/** `/finance/budgets` — monthly limits per expense category with coloured progress. */
export function BudgetsPage() {
  useFinanceSeed()
  const month = monthOf(today())
  const { from, to } = monthRange(month)
  const currency = useCurrency()
  const categories = useCategories()
  const budgets = useLiveQuery(() => db.budgets.toArray(), [])
  const txs = useLiveQuery(() => db.transactions.where('date').between(from, to, true, true).toArray(), [from, to])
  const [editing, setEditing] = useState<TxCategory | null>(null)

  const fmt = (n: number) => formatMoney(n, currency)
  const expenseCats = (categories ?? []).filter((c) => c.kind === 'expense')
  const limitBy = new Map((budgets ?? []).map((b) => [b.categoryId, b.monthlyLimit]))
  const spent = spentByCategory(txs ?? [], month)
  const totals = monthTotals(txs ?? [], month)
  const totalLimit = [...limitBy.values()].reduce((s, v) => s + v, 0)

  const withLimit = expenseCats.filter((c) => limitBy.has(c.id))
  const withoutLimit = expenseCats.filter((c) => !limitBy.has(c.id))

  const overallLevel = totalLimit > 0 ? budgetUsage(totals.expense, totalLimit).level : 'ok'
  const overallTone = LEVEL_TONE[overallLevel]

  return (
    <>
      <PageHeader title="Бюджеты" subtitle={monthLabel(month)} back="/finance" />
      <FinanceNav />

      <Card variant="accent" tone={totalLimit > 0 ? (overallTone === 'accent' ? 'amber' : overallTone) : 'amber'} className="p-5">
        <div className="flex items-center gap-2.5">
          <IconBadge name="target" tone={overallTone === 'accent' ? 'amber' : overallTone} size="sm" />
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Общий бюджет</h2>
        </div>
        {totalLimit > 0 ? (
          <>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[34px] leading-none font-bold tracking-tight">
                <CountUp value={totals.expense} format={moneyCounter(totals.expense, currency)} />
              </span>
              <span className="text-sm text-muted tabular-nums">из {fmt(totalLimit)}</span>
            </div>
            <p className="mt-1.5 mb-3 text-sm text-muted">
              {totals.expense <= totalLimit ? (
                <>
                  Осталось <span className="font-medium text-text tabular-nums">{fmt(totalLimit - totals.expense)}</span>
                </>
              ) : (
                <span className="text-danger">Перерасход {fmt(totals.expense - totalLimit)}</span>
              )}
            </p>
            <BudgetBar spent={totals.expense} limit={totalLimit} currency={currency} label="Общий бюджет" />
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Лимиты не заданы — бюджетом месяца считаются доходы ({fmt(totals.income)}). Задайте лимит для категории ниже.
          </p>
        )}
      </Card>

      {withLimit.length > 0 && (
        <>
          <SectionHeader title="С лимитом" icon="target" tone="amber" subtitle="жёлтый > 80 %, красный > 100 %" />
          <StaggerList as="ul" className="space-y-2.5">
            {withLimit.map((c, i) => {
              const s = spent.get(c.id) ?? 0
              const limit = limitBy.get(c.id) ?? 0
              const left = limit - s
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setEditing(c)}
                  aria-label={`Лимит: ${c.name}`}
                  className="block w-full rounded-3xl border border-white/[0.06] bg-surface bg-[image:var(--gradient-surface)] p-4 text-left shadow-[var(--shadow-card)] transition-[background-color,transform] hover:bg-surface-2 active:scale-[0.99] motion-reduce:active:scale-100"
                >
                  <span className="mb-3 flex items-center gap-3">
                    <EmojiBadge emoji={c.icon} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.name}</span>
                      <span className={`block text-xs tabular-nums ${left < 0 ? 'text-danger' : 'text-muted'}`}>
                        {left >= 0 ? `осталось ${fmt(left)}` : `перерасход ${fmt(-left)}`}
                      </span>
                    </span>
                    <Icon name="edit" size={16} className="text-muted" />
                  </span>
                  <BudgetBar spent={s} limit={limit} currency={currency} label={c.name} delay={0.05 * Math.min(i, 8)} />
                </button>
              )
            })}
          </StaggerList>
        </>
      )}

      <SectionHeader title="Без лимита" icon="list" tone="muted" />
      <Card as="div" className="overflow-hidden p-0">
        <ul className="divide-y divide-white/[0.05]">
          {withoutLimit.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setEditing(c)}
                aria-label={`Лимит: ${c.name}`}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
              >
                <EmojiBadge emoji={c.icon} tone="muted" size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted tabular-nums">{fmt(spent.get(c.id) ?? 0)}</span>
                <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-amber/15 px-2.5 text-xs font-medium text-amber">
                  <Icon name="plus" size={13} />
                  лимит
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `Лимит — ${editing.name}` : undefined}>
        {editing && (
          <LimitForm
            key={editing.id}
            initial={limitBy.get(editing.id)}
            currency={currency}
            onSave={async (limit) => {
              await setBudgetLimit(editing.id, limit)
              setEditing(null)
            }}
          />
        )}
      </Sheet>
    </>
  )
}

function LimitForm({
  initial,
  currency,
  onSave,
}: {
  initial?: number
  currency: ReturnType<typeof useCurrency>
  onSave: (limit: number) => Promise<void>
}) {
  const [value, setValue] = useState(initial != null ? String(initial) : '')
  const parsed = parseAmount(value)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (parsed != null) void onSave(parsed)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Лимит в месяц">
        <AmountInput value={value} onChange={setValue} currency={currency} autoFocus label="Лимит в месяц" />
      </Field>
      <Button type="submit" size="lg" icon="check" className="w-full" disabled={parsed == null}>
        Сохранить
      </Button>
      {initial != null && (
        <Button variant="danger" icon="x" className="w-full" onClick={() => void onSave(0)}>
          Убрать лимит
        </Button>
      )}
    </form>
  )
}
