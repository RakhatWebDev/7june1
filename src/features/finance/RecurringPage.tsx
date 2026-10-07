import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  IconBadge,
  Input,
  PageHeader,
  SectionHeader,
  Select,
  Sheet,
  StaggerList,
  StatTile,
} from '../../components/ui'
import { db } from '../../db'
import type { RecurringPayment, TxCategory } from '../../db/types'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import { formatMoney, monthLabel, monthOf, monthRange, parseAmount, recurringTotals, type Currency } from './calc'
import { AmountInput, EmojiBadge, FinanceNav } from './components'
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
        title="Подписки"
        subtitle="Регулярные платежи"
        back="/finance"
        action={
          <Button onClick={() => setEditing({})} aria-label="Добавить платёж" icon="plus" className="size-10 px-0!" />
        }
      />
      <FinanceNav />

      <section aria-label="Итого" className="grid grid-cols-2 gap-3">
        <StatTile
          icon="calendar"
          tone="amber"
          label="В месяц"
          value={<span data-testid="recurring-monthly">{fmt(totals.monthly)}</span>}
          sub={`${list.filter((r) => r.active).length} активн.`}
        />
        <StatTile
          icon="chart"
          tone="violet"
          label="В год"
          value={<span data-testid="recurring-yearly">{fmt(totals.yearly)}</span>}
          sub="× 12 месяцев"
        />
      </section>

      {list.length > 0 && (
        <Card variant="accent" tone={pending > 0 ? 'amber' : 'accent'} className="mt-3">
          <div className="flex items-center gap-3">
            <IconBadge name={pending > 0 ? 'timer' : 'check'} tone={pending > 0 ? 'amber' : 'accent'} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold first-letter:uppercase">{monthLabel(month)}</div>
              <div className="text-muted">{pending > 0 ? `К проведению: ${pending}` : 'Всё проведено'}</div>
            </div>
          </div>
          <Button
            className="mt-3 w-full"
            icon="check"
            variant={pending > 0 ? 'primary' : 'secondary'}
            onClick={() => void post()}
            disabled={pending === 0}
          >
            Провести за этот месяц
          </Button>
          {message && (
            <p role="status" className="mt-2 flex items-center gap-1.5 text-sm text-accent">
              <Icon name="check" size={16} />
              {message}
            </p>
          )}
        </Card>
      )}

      {items && list.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="calendar"
            tone="amber"
            title="Регулярных платежей нет"
            hint="Добавьте подписки, аренду, OneFit — посчитаем, сколько уходит в месяц и в год."
            action={
              <Button icon="plus" onClick={() => setEditing({})}>
                Добавить платёж
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <SectionHeader title="Платежи" icon="list" tone="amber" />
          <Card as="div" padding="none" className="overflow-hidden">
            <StaggerList as="ul" className="divide-y divide-white/[0.05]">
              {list.map((r) => {
                const c = catById.get(r.categoryId)
                const posted = postedIds?.has(r.id)
                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 px-3.5 py-3 transition-opacity ${r.active ? '' : 'opacity-55'}`}
                  >
                    <EmojiBadge emoji={c?.icon ?? '📱'} />
                    <button
                      type="button"
                      onClick={() => setEditing({ item: r })}
                      className="min-w-0 flex-1 text-left"
                      aria-label={`Изменить ${r.name}`}
                    >
                      <span className="block truncate text-sm font-semibold">{r.name}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-muted">
                        {r.dayOfMonth}-го · {c?.name ?? 'Без категории'}
                        {posted && (
                          <span className="inline-flex items-center gap-0.5 text-accent">
                            · <Icon name="check" size={12} strokeWidth={2.5} /> проведён
                          </span>
                        )}
                      </span>
                    </button>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{fmt(r.amount)}</span>
                    <Switch
                      checked={r.active}
                      label={`Активен: ${r.name}`}
                      onChange={(v) => void db.recurring.update(r.id, { active: v })}
                    />
                  </div>
                )
              })}
            </StaggerList>
          </Card>
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

/** iOS-style toggle over a real checkbox (keeps native semantics and the accessible name). */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className="h-7 w-12 rounded-full bg-surface-3 transition-colors duration-200 peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 left-1 size-5 rounded-full bg-text shadow-[0_2px_6px_rgb(0_0_0/0.4)] transition-transform duration-200 ease-[var(--ease-spring)] peer-checked:translate-x-5 peer-checked:bg-bg"
      />
    </span>
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
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-surface-3/40 px-3 text-sm">
        Активен
        <Switch checked={active} onChange={setActive} />
      </label>
      <Button type="submit" size="lg" icon="check" className="w-full" disabled={!valid}>
        Сохранить
      </Button>
      {item && (
        <Button variant="danger" icon="trash" className="w-full" onClick={() => void remove()}>
          Удалить
        </Button>
      )}
    </form>
  )
}
