import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, Field, PageHeader, Sheet } from '../../components/ui'
import { db } from '../../db'
import type { TxCategory } from '../../db/types'
import { today } from '../../lib/dates'
import { formatMoney, monthLabel, monthOf, monthRange, monthTotals, parseAmount, spentByCategory } from './calc'
import { AmountInput, BudgetBar, FinanceNav, SectionTitle } from './components'
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

  return (
    <>
      <PageHeader title="Бюджеты" subtitle={monthLabel(month)} back="/finance" />
      <FinanceNav />

      <Card className="mb-4">
        <SectionTitle>Общий бюджет</SectionTitle>
        {totalLimit > 0 ? (
          <BudgetBar spent={totals.expense} limit={totalLimit} currency={currency} label="Общий бюджет" />
        ) : (
          <p className="text-sm text-muted">
            Лимиты не заданы — бюджетом месяца считаются доходы ({fmt(totals.income)}). Задайте лимит для категории ниже.
          </p>
        )}
      </Card>

      {withLimit.length > 0 && (
        <>
          <SectionTitle>С лимитом</SectionTitle>
          <ul className="mb-4 space-y-2">
            {withLimit.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  aria-label={`Лимит: ${c.name}`}
                  className="w-full rounded-2xl border border-border bg-surface p-3 text-left hover:bg-surface-2"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xl" aria-hidden>
                      {c.icon}
                    </span>
                    <span className="flex-1 truncate font-medium">{c.name}</span>
                  </div>
                  <BudgetBar spent={spent.get(c.id) ?? 0} limit={limitBy.get(c.id) ?? 0} currency={currency} label={c.name} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Без лимита</SectionTitle>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {withoutLimit.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setEditing(c)}
              aria-label={`Лимит: ${c.name}`}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
            >
              <span className="text-xl" aria-hidden>
                {c.icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
              <span className="text-xs text-muted tabular-nums">{fmt(spent.get(c.id) ?? 0)}</span>
              <span className="text-xs text-accent">+ лимит</span>
            </button>
          </li>
        ))}
      </ul>

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
      <Button type="submit" size="lg" className="w-full" disabled={parsed == null}>
        Сохранить
      </Button>
      {initial != null && (
        <Button variant="danger" className="w-full" onClick={() => void onSave(0)}>
          Убрать лимит
        </Button>
      )}
    </form>
  )
}
