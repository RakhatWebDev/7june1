import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, EmptyState, Field, Input, PageHeader, Select, Sheet, Stat } from '../../components/ui'
import { db } from '../../db'
import type { RecurringPayment, TxCategory } from '../../db/types'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import { formatMoney, monthLabel, monthOf, monthRange, parseAmount, recurringTotals, type Currency } from './calc'
import { AmountInput, FinanceNav, SectionTitle } from './components'
import { postRecurringForMonth } from './actions'
import { useCategories, useCurrency, useFinanceSeed } from './hooks'

type Editing = { item?: RecurringPayment } | null

/** `/finance/recurring` — subscriptions, rent, OneFit: monthly/yearly totals and posting for the month. */
export function RecurringPage() {
  useFinanceSeed()
  const month = monthOf(today())
  const { from, to } = monthRange(month)
  const currency = useCurrency()
  const categories = useCategories()
  const items = useLiveQuery(() => db.recurring.toArray(), [])
  const postedIds = useLiveQuery(
    async () =>
      new Set(
        (await db.transactions.where('date').between(from, to, true, true).toArray())
          .map((t) => t.recurringId)
          .filter((id): id is string => !!id),
      ),
    [from, to],
  )
  const [editing, setEditing] = useState<Editing>(null)
  const [message, setMessage] = useState<string | null>(null)

  const fmt = (n: number) => formatMoney(n, currency)
  const list = [...(items ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || a.dayOfMonth - b.dayOfMonth)
  const totals = recurringTotals(list)
  const catById = new Map((categories ?? []).map((c) => [c.id, c]))
  const pending = list.filter((r) => r.active && !postedIds?.has(r.id)).length

  async function post() {
    const n = await postRecurringForMonth(month)
    setMessage(n > 0 ? `Проведено платежей: ${n}` : 'Все платежи за этот месяц уже проведены')
  }

  return (
    <>
      <PageHeader
        title="Регулярные платежи"
        back="/finance"
        action={
          <Button onClick={() => setEditing({})} aria-label="Добавить платёж">
            + Добавить
          </Button>
        }
      />
      <FinanceNav />

      <section aria-label="Итого" className="mb-4 grid grid-cols-2 gap-2">
        <Stat label="В месяц" value={<span data-testid="recurring-monthly">{fmt(totals.monthly)}</span>} />
        <Stat label="В год" value={<span data-testid="recurring-yearly">{fmt(totals.yearly)}</span>} />
      </section>

      {list.length > 0 && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <div className="font-medium">{monthLabel(month)}</div>
              <div className="text-muted">
                {pending > 0 ? `К проведению: ${pending}` : 'Всё проведено'}
              </div>
            </div>
            <Button onClick={() => void post()} disabled={pending === 0}>
              Провести за этот месяц
            </Button>
          </div>
          {message && (
            <p role="status" className="mt-2 text-sm text-accent">
              {message}
            </p>
          )}
        </Card>
      )}

      {items && list.length === 0 ? (
        <EmptyState
          title="Регулярных платежей нет"
          hint="Добавьте подписки, аренду, OneFit — посчитаем, сколько уходит в месяц и в год."
          action={<Button onClick={() => setEditing({})}>Добавить платёж</Button>}
        />
      ) : (
        <>
          <SectionTitle>Платежи</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {list.map((r) => {
              const c = catById.get(r.categoryId)
              const posted = postedIds?.has(r.id)
              return (
                <li key={r.id} className={`flex items-center gap-3 px-3 py-2.5 ${r.active ? '' : 'opacity-60'}`}>
                  <span className="text-xl" aria-hidden>
                    {c?.icon ?? '📱'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing({ item: r })}
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Изменить ${r.name}`}
                  >
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    <span className="block text-xs text-muted">
                      {r.dayOfMonth}-го числа · {c?.name ?? 'Без категории'}
                      {posted && <span className="text-accent"> · ✓ проведён</span>}
                    </span>
                  </button>
                  <span className="shrink-0 text-sm font-medium tabular-nums">{fmt(r.amount)}</span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
                    checked={r.active}
                    aria-label={`Активен: ${r.name}`}
                    onChange={(e) => void db.recurring.update(r.id, { active: e.target.checked })}
                  />
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.item ? 'Регулярный платёж' : 'Новый регулярный платёж'}
      >
        {editing && categories && (
          <RecurringForm
            key={editing.item?.id ?? 'new'}
            item={editing.item}
            categories={categories.filter((c) => c.kind === 'expense')}
            currency={currency}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  )
}

function RecurringForm({
  item,
  categories,
  currency,
  onDone,
}: {
  item?: RecurringPayment
  categories: TxCategory[]
  currency: Currency
  onDone: () => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? 'cat-subscriptions')
  const [day, setDay] = useState(String(item?.dayOfMonth ?? Number(today().slice(8, 10))))
  const [active, setActive] = useState(item?.active ?? true)
  const parsed = parseAmount(amount)
  const dayNum = Math.min(28, Math.max(1, Math.round(Number(day) || 1)))
  const valid = name.trim() !== '' && parsed != null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || parsed == null) return
    await db.recurring.put({
      id: item?.id ?? newId(),
      name: name.trim(),
      amount: parsed,
      categoryId,
      dayOfMonth: dayNum,
      active,
      ...(item?.note ? { note: item.note } : {}),
    })
    onDone()
  }

  async function remove() {
    if (!item || !window.confirm(`Удалить «${item.name}»?`)) return
    await db.recurring.delete(item.id)
    onDone()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <Field label="Название">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="OneFit, аренда, Spotify" required />
      </Field>
      <AmountInput value={amount} onChange={setAmount} currency={currency} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Категория">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="День месяца" hint="1–28">
          <Input type="number" inputMode="numeric" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--color-accent)]"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Активен
      </label>
      <Button type="submit" size="lg" className="w-full" disabled={!valid}>
        Сохранить
      </Button>
      {item && (
        <Button variant="danger" className="w-full" onClick={() => void remove()}>
          Удалить
        </Button>
      )}
    </form>
  )
}
