import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, EmptyState, Field, Input, PageHeader, Progress, Sheet, Stat } from '../../components/ui'
import { db } from '../../db'
import type { SavingsGoal } from '../../db/types'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import { CURRENCY_SYMBOL, formatMoney, monthlyContribution, parseAmount, savingsProgress, type Currency } from './calc'
import { AmountInput, FinanceNav } from './components'
import { topUpSavings } from './actions'
import { useCurrency, useFinanceSeed } from './hooks'

const GOAL_ICONS = ['🎯', '🏦', '🚗', '🏠', '✈️', '💻', '📱', '🎓', '💍', '🛡️']

type SheetState = { kind: 'goal'; goal?: SavingsGoal } | { kind: 'topup'; goal: SavingsGoal } | null

function longDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}

/** `/finance/savings` — savings goals with progress and the monthly contribution needed. */
export function SavingsPage() {
  useFinanceSeed()
  const currency = useCurrency()
  const goals = useLiveQuery(() => db.savingsGoals.toArray(), [])
  const [sheet, setSheet] = useState<SheetState>(null)
  const fmt = (n: number) => formatMoney(n, currency)
  const now = today()

  const list = [...(goals ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const saved = list.reduce((s, g) => s + g.savedAmount, 0)
  const target = list.reduce((s, g) => s + g.targetAmount, 0)
  const perMonth = list.reduce((s, g) => s + (monthlyContribution(g, now) ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Накопления"
        back="/finance"
        action={<Button onClick={() => setSheet({ kind: 'goal' })}>+ Цель</Button>}
      />
      <FinanceNav />

      {list.length > 0 && (
        <section aria-label="Итого" className="mb-4 grid grid-cols-2 gap-2">
          <Stat label="Накоплено" value={fmt(saved)} sub={`из ${fmt(target)}`} />
          <Stat label="Откладывать в месяц" value={fmt(perMonth)} sub="по целям с дедлайном" />
        </section>
      )}

      {goals && list.length === 0 ? (
        <EmptyState
          title="Целей пока нет"
          hint="Подушка безопасности, машина, поездка — задайте сумму и срок, посчитаем взнос в месяц."
          action={<Button onClick={() => setSheet({ kind: 'goal' })}>Создать цель</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {list.map((g) => {
            const progress = savingsProgress(g)
            const monthly = monthlyContribution(g, now)
            const done = g.savedAmount >= g.targetAmount
            return (
              <Card as="li" key={g.id}>
                <div className="mb-2 flex items-start gap-3">
                  <span className="text-3xl leading-none" aria-hidden>
                    {g.icon}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setSheet({ kind: 'goal', goal: g })}
                    aria-label={`Изменить цель ${g.name}`}
                  >
                    <span className="block truncate font-semibold">{g.name}</span>
                    <span className="block text-xs text-muted">
                      {g.deadline ? `до ${longDate(g.deadline)}` : 'без срока'}
                    </span>
                  </button>
                  <span className="shrink-0 text-sm font-medium text-accent tabular-nums">{Math.round(progress * 100)}%</span>
                </div>
                <Progress value={progress} />
                <div className="mt-1 flex justify-between gap-2 text-xs text-muted tabular-nums">
                  <span>
                    {fmt(g.savedAmount)} из {fmt(g.targetAmount)}
                  </span>
                  <span>осталось {fmt(Math.max(0, g.targetAmount - g.savedAmount))}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-sm" data-testid={`monthly-${g.id}`}>
                    {done
                      ? '🎉 Цель достигнута'
                      : monthly != null
                        ? `Нужно ${fmt(monthly)} в месяц`
                        : 'Задайте дедлайн, чтобы посчитать взнос'}
                  </span>
                  <Button size="sm" onClick={() => setSheet({ kind: 'topup', goal: g })} aria-label={`Пополнить ${g.name}`}>
                    + Пополнить
                  </Button>
                </div>
              </Card>
            )
          })}
        </ul>
      )}

      <Sheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={
          sheet?.kind === 'topup' ? `Пополнить «${sheet.goal.name}»` : sheet?.goal ? 'Цель накоплений' : 'Новая цель'
        }
      >
        {sheet?.kind === 'topup' && (
          <TopUpForm goal={sheet.goal} currency={currency} onDone={() => setSheet(null)} />
        )}
        {sheet?.kind === 'goal' && (
          <GoalForm key={sheet.goal?.id ?? 'new'} goal={sheet.goal} currency={currency} onDone={() => setSheet(null)} />
        )}
      </Sheet>
    </>
  )
}

function TopUpForm({ goal, currency, onDone }: { goal: SavingsGoal; currency: Currency; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const parsed = parseAmount(amount)
  const suggested = monthlyContribution(goal, today())

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (parsed == null) return
    await topUpSavings(goal, parsed, today())
    onDone()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <AmountInput value={amount} onChange={setAmount} currency={currency} autoFocus />
      {suggested != null && suggested > 0 && (
        <button type="button" className="text-sm text-accent" onClick={() => setAmount(String(suggested))}>
          Месячный взнос: {formatMoney(suggested, currency)}
        </button>
      )}
      <p className="text-xs text-muted">Пополнение запишется расходом в категорию «Накопления».</p>
      <Button type="submit" size="lg" className="w-full" disabled={parsed == null}>
        Пополнить
      </Button>
    </form>
  )
}

function GoalForm({ goal, currency, onDone }: { goal?: SavingsGoal; currency: Currency; onDone: () => void }) {
  const [name, setName] = useState(goal?.name ?? '')
  const [icon, setIcon] = useState(goal?.icon ?? GOAL_ICONS[0])
  const [target, setTarget] = useState(goal ? String(goal.targetAmount) : '')
  const [saved, setSaved] = useState(goal ? String(goal.savedAmount) : '')
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const targetNum = parseAmount(target)
  const savedNum = saved.trim() === '' || Number(saved) === 0 ? 0 : parseAmount(saved)
  const valid = name.trim() !== '' && targetNum != null && savedNum != null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || targetNum == null || savedNum == null) return
    await db.savingsGoals.put({
      id: goal?.id ?? newId(),
      name: name.trim(),
      icon,
      targetAmount: targetNum,
      savedAmount: savedNum,
      ...(deadline ? { deadline } : {}),
      createdAt: goal?.createdAt ?? new Date().toISOString(),
    })
    onDone()
  }

  async function remove() {
    if (!goal || !window.confirm(`Удалить цель «${goal.name}»?`)) return
    await db.savingsGoals.delete(goal.id)
    onDone()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <Field label="Название">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Подушка безопасности" required />
      </Field>
      <div role="group" aria-label="Иконка" className="flex flex-wrap gap-2">
        {GOAL_ICONS.map((i) => (
          <button
            key={i}
            type="button"
            aria-pressed={icon === i}
            onClick={() => setIcon(i)}
            className={`h-10 w-10 rounded-xl border text-xl ${
              icon === i ? 'border-accent bg-accent/15' : 'border-border bg-surface-2'
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Цель, ${CURRENCY_SYMBOL[currency]}`}>
          <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1 000 000" />
        </Field>
        <Field label="Уже накоплено">
          <Input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <Field label="Дедлайн (необязательно)">
        <Input type="date" value={deadline} min={today()} onChange={(e) => setDeadline(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={!valid}>
        Сохранить
      </Button>
      {goal && (
        <Button variant="danger" className="w-full" onClick={() => void remove()}>
          Удалить цель
        </Button>
      )}
    </form>
  )
}
