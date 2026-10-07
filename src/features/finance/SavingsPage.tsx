import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import {
  Button,
  Card,
  CountUp,
  EmptyState,
  Field,
  Icon,
  IconBadge,
  Input,
  PageHeader,
  Progress,
  Ring,
  SectionHeader,
  Sheet,
  StaggerList,
  StatTile,
} from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import { db } from '../../db'
import type { SavingsGoal } from '../../db/types'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import {
  CURRENCY_SYMBOL,
  formatMoney,
  monthlyContribution,
  parseAmount,
  savingsProgress,
  type Currency,
} from './calc'
import { AmountInput, EmojiBadge, FinanceNav, moneyCounter } from './components'
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
  const reached = list.filter((g) => g.savedAmount >= g.targetAmount).length

  return (
    <>
      <PageHeader
        title="Накопления"
        back="/finance"
        action={
          <Button variant="secondary" icon="plus" onClick={() => setSheet({ kind: 'goal' })}>
            Цель
          </Button>
        }
      />
      <FinanceNav />

      {list.length > 0 && (
        <section aria-label="Итого" className="space-y-3">
          <Card variant="accent" tone="amber" className="p-5">
            <div className="flex items-center gap-2.5">
              <IconBadge name="target" tone="amber" size="sm" />
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
                Накоплено
              </h2>
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[34px] leading-none font-bold tracking-tight">
                <CountUp value={saved} format={moneyCounter(saved, currency)} />
              </span>
              <span className="text-sm text-muted tabular-nums">из {fmt(target)}</span>
            </div>
            <Progress
              value={target > 0 ? saved / target : 0}
              tone="amber"
              className="mt-4"
              aria-label="Накоплено по всем целям"
            />
          </Card>
          <StaggerList className="grid grid-cols-2 gap-3" itemClassName="*:h-full" delay={0.08}>
            <StatTile
              key="monthly"
              icon="calendar"
              tone="amber"
              label="В месяц"
              value={<span className="text-[19px]">{fmt(perMonth)}</span>}
              sub="по целям с дедлайном"
            />
            <StatTile
              key="goals"
              icon="trophy"
              tone="accent"
              label="Достигнуто"
              value={reached}
              unit={`из ${list.length}`}
              sub="целей"
            />
          </StaggerList>
        </section>
      )}

      {goals && list.length === 0 ? (
        <EmptyState
          icon="target"
          tone="amber"
          title="Целей пока нет"
          hint="Подушка безопасности, машина, поездка — задайте сумму и срок, посчитаем взнос в месяц."
          action={
            <Button icon="plus" onClick={() => setSheet({ kind: 'goal' })}>
              Создать цель
            </Button>
          }
        />
      ) : (
        <>
          {list.length > 0 && <SectionHeader title="Цели" icon="target" tone="amber" />}
          <StaggerList as="ul" className="space-y-3">
            {list.map((g) => {
              const progress = savingsProgress(g)
              const monthly = monthlyContribution(g, now)
              const done = g.savedAmount >= g.targetAmount
              const tone = done ? 'accent' : 'amber'
              return (
                <Card as="div" key={g.id} tone={done ? 'accent' : undefined}>
                  <div className="flex items-center gap-3.5">
                    <Ring
                      value={progress}
                      size={64}
                      stroke={7}
                      tone={tone}
                      aria-label={`Прогресс цели ${g.name}`}
                    >
                      <span className="text-[13px] font-semibold tabular-nums">
                        {Math.round(progress * 100)}%
                      </span>
                    </Ring>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      onClick={() => setSheet({ kind: 'goal', goal: g })}
                      aria-label={`Изменить цель ${g.name}`}
                    >
                      <EmojiBadge emoji={g.icon} tone={tone} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{g.name}</span>
                        <span className="flex items-center gap-1 text-xs text-muted">
                          <Icon name="calendar" size={12} />
                          {g.deadline ? `до ${longDate(g.deadline)}` : 'без срока'}
                        </span>
                      </span>
                      <Icon name="chevron-right" size={16} className="text-muted" />
                    </button>
                  </div>
                  <div className="mt-3 flex justify-between gap-2 text-xs text-muted tabular-nums">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold text-text">{fmt(g.savedAmount)}</span> из{' '}
                      {fmt(g.targetAmount)}
                    </span>
                    <span className="shrink-0">
                      осталось {fmt(Math.max(0, g.targetAmount - g.savedAmount))}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                    <span
                      className={`flex min-w-0 items-center gap-1.5 text-sm ${done ? 'font-medium text-accent' : ''}`}
                      data-testid={`monthly-${g.id}`}
                    >
                      {done
                        ? '🎉 Цель достигнута'
                        : monthly != null
                          ? `Нужно ${fmt(monthly)} в месяц`
                          : 'Задайте дедлайн, чтобы посчитать взнос'}
                    </span>
                    <Button
                      size="sm"
                      variant={done ? 'secondary' : 'primary'}
                      icon="plus"
                      className="shrink-0"
                      onClick={() => setSheet({ kind: 'topup', goal: g })}
                      aria-label={`Пополнить ${g.name}`}
                    >
                      Пополнить
                    </Button>
                  </div>
                </Card>
              )
            })}
          </StaggerList>
        </>
      )}

      <Sheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={
          sheet?.kind === 'topup'
            ? `Пополнить «${sheet.goal.name}»`
            : sheet?.goal
              ? 'Цель накоплений'
              : 'Новая цель'
        }
      >
        {sheet?.kind === 'topup' && (
          <TopUpForm goal={sheet.goal} currency={currency} onDone={() => setSheet(null)} />
        )}
        {sheet?.kind === 'goal' && (
          <GoalForm
            key={sheet.goal?.id ?? 'new'}
            goal={sheet.goal}
            currency={currency}
            onDone={() => setSheet(null)}
          />
        )}
      </Sheet>
    </>
  )
}

function TopUpForm({
  goal,
  currency,
  onDone,
}: {
  goal: SavingsGoal
  currency: Currency
  onDone: () => void
}) {
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
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-amber/15 px-3 text-sm font-medium text-amber transition-transform active:scale-95 motion-reduce:active:scale-100"
          onClick={() => setAmount(String(suggested))}
        >
          <Icon name="sparkles" size={15} />
          Месячный взнос: {formatMoney(suggested, currency)}
        </button>
      )}
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <Icon name="info" size={14} className="mt-px" />
        Пополнение запишется расходом в категорию «Накопления».
      </p>
      <Button type="submit" size="lg" icon="check" className="w-full" disabled={parsed == null}>
        Пополнить
      </Button>
    </form>
  )
}

function GoalForm({
  goal,
  currency,
  onDone,
}: {
  goal?: SavingsGoal
  currency: Currency
  onDone: () => void
}) {
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
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Подушка безопасности"
          required
        />
      </Field>
      <div>
        <p className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Иконка</p>
        <div role="group" aria-label="Иконка" className="grid grid-cols-5 gap-2">
          {GOAL_ICONS.map((i) => (
            <IconTile key={i} emoji={i} active={icon === i} onClick={() => setIcon(i)} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Цель, ${CURRENCY_SYMBOL[currency]}`}>
          <Input
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="1 000 000"
          />
        </Field>
        <Field label="Уже накоплено">
          <Input
            inputMode="decimal"
            value={saved}
            onChange={(e) => setSaved(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>
      <Field label="Дедлайн (необязательно)">
        <Input
          type="date"
          value={deadline}
          min={today()}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" icon="check" className="w-full" disabled={!valid}>
        Сохранить
      </Button>
      {goal && (
        <Button variant="danger" icon="trash" className="w-full" onClick={() => void remove()}>
          Удалить цель
        </Button>
      )}
    </form>
  )
}

/** Emoji choice tile that presses in with a spring. */
function IconTile({
  emoji,
  active,
  onClick,
}: {
  emoji: string
  active: boolean
  onClick: () => void
}) {
  const reduce = useReduceMotion()
  return (
    <motion.button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      className={`grid aspect-square min-h-11 place-items-center rounded-2xl border text-2xl leading-none transition-colors ${
        active
          ? 'border-amber/60 bg-amber/12'
          : 'border-white/[0.05] bg-surface-2 hover:bg-surface-3'
      }`}
    >
      {emoji}
    </motion.button>
  )
}
