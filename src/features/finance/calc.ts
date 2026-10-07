import { addMonths, differenceInCalendarMonths, getDaysInMonth } from 'date-fns'
import type { Budget, ISODate, RecurringPayment, SavingsGoal, Transaction, TxCategory, TxKind } from '../../db/types'
import { fromISODate, toISODate } from '../../lib/dates'

/* --------------------------------- Currency --------------------------------- */

export type Currency = 'KZT' | 'RUB' | 'USD' | 'EUR'
export const CURRENCIES: Currency[] = ['KZT', 'RUB', 'USD', 'EUR']
export const DEFAULT_CURRENCY: Currency = 'KZT'
export const CURRENCY_SETTING_KEY = 'currency'

export const CURRENCY_SYMBOL: Record<Currency, string> = { KZT: '₸', RUB: '₽', USD: '$', EUR: '€' }
export const CURRENCY_RU: Record<Currency, string> = {
  KZT: 'Тенге (₸)',
  RUB: 'Рубль (₽)',
  USD: 'Доллар ($)',
  EUR: 'Евро (€)',
}

/** Narrows an arbitrary settings value to a supported currency (default KZT). */
export function parseCurrency(value: unknown): Currency {
  return CURRENCIES.includes(value as Currency) ? (value as Currency) : DEFAULT_CURRENCY
}

const NBSP = ' '

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

/**
 * "12 500 ₸", "1 500,50 ₸": thousands separated by a non-breaking space,
 * no fraction when the amount is whole, otherwise 2 digits after a comma.
 */
export function formatMoney(n: number, currency: Currency = DEFAULT_CURRENCY): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? CURRENCY_SYMBOL.KZT
  if (!Number.isFinite(n)) return `—${NBSP}${symbol}`
  const cents = Math.round(Math.abs(n) * 100)
  const whole = Math.floor(cents / 100)
  const frac = cents % 100
  const sign = n < 0 && cents > 0 ? '−' : ''
  const body = groupThousands(String(whole)) + (frac ? `,${String(frac).padStart(2, '0')}` : '')
  return `${sign}${body}${NBSP}${symbol}`
}

/** Parses user input like "1 500,50" or "1500.5"; returns null for empty/invalid/non-positive. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[\s ]/g, '').replace(',', '.')
  if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned)) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

export const KIND_RU: Record<TxKind, string> = { expense: 'Расход', income: 'Доход' }

/* ---------------------------------- Months ---------------------------------- */

/** "YYYY-MM" */
export type MonthKey = string

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export const MONTHS_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

export function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7)
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  return toISODate(addMonths(fromISODate(`${month}-01`), delta)).slice(0, 7)
}

export function daysInMonth(month: MonthKey): number {
  return getDaysInMonth(fromISODate(`${month}-01`))
}

/** First and last ISO day of the month (inclusive). */
export function monthRange(month: MonthKey): { from: ISODate; to: ISODate } {
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` }
}

/** "Октябрь 2026" */
export function monthLabel(month: MonthKey): string {
  return `${MONTHS_RU[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

/**
 * Days left in `month` counting `todayISO` itself: the full month for a future month,
 * 0 for a past month.
 */
export function remainingDays(month: MonthKey, todayISO: ISODate): number {
  const current = monthOf(todayISO)
  if (month < current) return 0
  const total = daysInMonth(month)
  if (month > current) return total
  return total - Number(todayISO.slice(8, 10)) + 1
}

/* --------------------------------- Summaries -------------------------------- */

export function inMonth(t: Pick<Transaction, 'date'>, month: MonthKey): boolean {
  return t.date.startsWith(`${month}-`)
}

export interface MonthTotals {
  income: number
  expense: number
  balance: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Income, expense and balance for the transactions of `month`. */
export function monthTotals(txs: Transaction[], month: MonthKey): MonthTotals {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (!inMonth(t, month)) continue
    if (t.kind === 'income') income += t.amount
    else expense += t.amount
  }
  return { income: round2(income), expense: round2(expense), balance: round2(income - expense) }
}

export interface CategorySlice {
  categoryId: string
  name: string
  icon: string
  color: string
  amount: number
  /** Share of the kind's total, 0–100 */
  pct: number
}

/** Totals per category for one kind in `month`, largest first. Unknown categories fall back to "Прочее". */
export function categoryBreakdown(
  txs: Transaction[],
  categories: TxCategory[],
  month: MonthKey,
  kind: TxKind = 'expense',
): CategorySlice[] {
  const sums = new Map<string, number>()
  let total = 0
  for (const t of txs) {
    if (t.kind !== kind || !inMonth(t, month)) continue
    sums.set(t.categoryId, (sums.get(t.categoryId) ?? 0) + t.amount)
    total += t.amount
  }
  const byId = new Map(categories.map((c) => [c.id, c]))
  return [...sums.entries()]
    .map(([categoryId, amount]) => {
      const c = byId.get(categoryId)
      return {
        categoryId,
        name: c?.name ?? 'Прочее',
        icon: c?.icon ?? '📦',
        color: c?.color ?? '#94a3b8',
        amount: round2(amount),
        pct: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

export interface DayAmount {
  date: ISODate
  /** Day of month 1–31 */
  day: number
  amount: number
}

/** Expenses for each day of `month` (zero-filled), for the daily bar chart. */
export function dailyExpenses(txs: Transaction[], month: MonthKey): DayAmount[] {
  const n = daysInMonth(month)
  const out: DayAmount[] = Array.from({ length: n }, (_, i) => ({
    date: `${month}-${String(i + 1).padStart(2, '0')}`,
    day: i + 1,
    amount: 0,
  }))
  for (const t of txs) {
    if (t.kind !== 'expense' || !inMonth(t, month)) continue
    const d = Number(t.date.slice(8, 10))
    if (d >= 1 && d <= n) out[d - 1].amount = round2(out[d - 1].amount + t.amount)
  }
  return out
}

/** Sum of an expense kind on one day. */
export function spentOn(txs: Transaction[], date: ISODate): number {
  return round2(txs.filter((t) => t.kind === 'expense' && t.date === date).reduce((s, t) => s + t.amount, 0))
}

/** Monthly budget = sum of category limits, or the month's income when no limits are set. */
export function monthBudget(budgets: Budget[], monthIncome: number): number {
  const limits = budgets.reduce((s, b) => s + (b.monthlyLimit > 0 ? b.monthlyLimit : 0), 0)
  return round2(limits > 0 ? limits : monthIncome)
}

/**
 * How much can be spent per day until the end of the month:
 * (budget − expenses) / days left. Null when no days are left (past month) or there is no budget.
 * May be negative when the budget is already exceeded.
 */
export function dailyAllowance(budget: number, spent: number, daysLeft: number): number | null {
  if (daysLeft <= 0 || budget <= 0) return null
  return round2((budget - spent) / daysLeft)
}

/** Groups transactions by date, newest day first, newest entries first inside a day. */
export function groupByDate(txs: Transaction[]): { date: ISODate; items: Transaction[]; net: number }[] {
  const map = new Map<ISODate, Transaction[]>()
  for (const t of txs) {
    const list = map.get(t.date)
    if (list) list.push(t)
    else map.set(t.date, [t])
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      net: round2(items.reduce((s, t) => s + (t.kind === 'income' ? t.amount : -t.amount), 0)),
    }))
}

/* ---------------------------------- Budgets --------------------------------- */

export type BudgetLevel = 'ok' | 'warn' | 'danger'

/** Spent share of a limit in % (rounded to 0.1) and its colour level: warn > 80 %, danger > 100 %. */
export function budgetUsage(spent: number, limit: number): { pct: number; level: BudgetLevel } {
  if (limit <= 0) return { pct: spent > 0 ? 100 : 0, level: spent > 0 ? 'danger' : 'ok' }
  const pct = Math.round((spent / limit) * 1000) / 10
  return { pct, level: pct > 100 ? 'danger' : pct > 80 ? 'warn' : 'ok' }
}

/** Expense totals per category id for `month`. */
export function spentByCategory(txs: Transaction[], month: MonthKey): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of txs) {
    if (t.kind !== 'expense' || !inMonth(t, month)) continue
    m.set(t.categoryId, round2((m.get(t.categoryId) ?? 0) + t.amount))
  }
  return m
}

/* --------------------------------- Recurring -------------------------------- */

/** Monthly and yearly cost of active recurring payments. */
export function recurringTotals(items: RecurringPayment[]): { monthly: number; yearly: number } {
  const monthly = round2(items.filter((r) => r.active).reduce((s, r) => s + r.amount, 0))
  return { monthly, yearly: round2(monthly * 12) }
}

/** Date of a recurring payment in `month` (day clamped to the month's length). */
export function recurringDate(month: MonthKey, dayOfMonth: number): ISODate {
  const day = Math.min(Math.max(1, Math.round(dayOfMonth)), daysInMonth(month))
  return `${month}-${String(day).padStart(2, '0')}`
}

/* ---------------------------------- Savings --------------------------------- */

export function savingsProgress(goal: Pick<SavingsGoal, 'savedAmount' | 'targetAmount'>): number {
  if (goal.targetAmount <= 0) return 0
  return Math.max(0, Math.min(1, goal.savedAmount / goal.targetAmount))
}

/** Calendar months left until the deadline, counting the current month (min 1). */
export function monthsUntil(deadline: ISODate, todayISO: ISODate): number {
  return Math.max(1, differenceInCalendarMonths(fromISODate(deadline), fromISODate(todayISO)) + 1)
}

/**
 * Monthly contribution needed to reach the target by the deadline:
 * remaining / months left (current month included). 0 when reached, null without a deadline.
 * Past deadline → the whole remaining amount.
 */
export function monthlyContribution(
  goal: Pick<SavingsGoal, 'savedAmount' | 'targetAmount' | 'deadline'>,
  todayISO: ISODate,
): number | null {
  const remaining = goal.targetAmount - goal.savedAmount
  if (remaining <= 0) return 0
  if (!goal.deadline) return null
  return Math.ceil((remaining / monthsUntil(goal.deadline, todayISO)) * 100) / 100
}
