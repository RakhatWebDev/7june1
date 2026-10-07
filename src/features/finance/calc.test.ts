import { describe, expect, it } from 'vitest'
import type { Budget, RecurringPayment, Transaction } from '../../db/types'
import {
  budgetUsage,
  categoryBreakdown,
  dailyAllowance,
  dailyExpenses,
  formatMoney,
  groupByDate,
  monthBudget,
  monthLabel,
  monthTotals,
  monthlyContribution,
  monthsUntil,
  parseAmount,
  parseCurrency,
  recurringDate,
  recurringTotals,
  remainingDays,
  shiftMonth,
  spentOn,
} from './calc'
import { DEFAULT_CATEGORIES } from './seed'

const NB = ' '
let seq = 0
function tx(kind: Transaction['kind'], amount: number, date: string, categoryId = 'cat-food'): Transaction {
  seq++
  return { id: `t${seq}`, kind, amount, date, categoryId, createdAt: `2026-01-01T00:00:${String(seq % 60).padStart(2, '0')}Z` }
}

const OCT: Transaction[] = [
  tx('income', 500_000, '2026-10-01', 'cat-salary'),
  tx('income', 50_000, '2026-10-15', 'cat-freelance'),
  tx('expense', 12_000, '2026-10-02', 'cat-food'),
  tx('expense', 3_000, '2026-10-02', 'cat-transport'),
  tx('expense', 25_000, '2026-10-05', 'cat-sport'),
  tx('expense', 10_000, '2026-10-07', 'cat-food'),
  // other months are ignored
  tx('expense', 99_999, '2026-09-30', 'cat-food'),
  tx('income', 1, '2026-11-01', 'cat-salary'),
]

describe('formatMoney', () => {
  it('groups thousands and drops kopecks for whole amounts', () => {
    expect(formatMoney(12500, 'KZT')).toBe(`12${NB}500${NB}₸`)
    expect(formatMoney(1_234_567, 'RUB')).toBe(`1${NB}234${NB}567${NB}₽`)
    expect(formatMoney(0, 'USD')).toBe(`0${NB}$`)
    expect(formatMoney(999, 'EUR')).toBe(`999${NB}€`)
  })

  it('shows two fraction digits when not whole, and a minus sign for negatives', () => {
    expect(formatMoney(1500.5, 'KZT')).toBe(`1${NB}500,50${NB}₸`)
    expect(formatMoney(-2500, 'KZT')).toBe(`−2${NB}500${NB}₸`)
    expect(formatMoney(10.004, 'KZT')).toBe(`10${NB}₸`)
  })

  it('defaults to KZT', () => {
    expect(formatMoney(100)).toBe(`100${NB}₸`)
    expect(parseCurrency(undefined)).toBe('KZT')
    expect(parseCurrency('XYZ')).toBe('KZT')
    expect(parseCurrency('EUR')).toBe('EUR')
  })
})

describe('parseAmount', () => {
  it('accepts spaces and comma decimals', () => {
    expect(parseAmount('1 500,5')).toBe(1500.5)
    expect(parseAmount('2500')).toBe(2500)
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
})

describe('month totals', () => {
  it('sums income, expense and balance for the month only', () => {
    expect(monthTotals(OCT, '2026-10')).toEqual({ income: 550_000, expense: 50_000, balance: 500_000 })
    expect(monthTotals(OCT, '2026-09')).toEqual({ income: 0, expense: 99_999, balance: -99_999 })
  })

  it('zero-fills daily expenses for every day of the month', () => {
    const days = dailyExpenses(OCT, '2026-10')
    expect(days).toHaveLength(31)
    expect(days[1]).toEqual({ date: '2026-10-02', day: 2, amount: 15_000 })
    expect(days[0].amount).toBe(0)
    expect(days.reduce((s, d) => s + d.amount, 0)).toBe(50_000)
    expect(dailyExpenses([], '2026-02')).toHaveLength(28)
  })

  it('spentOn sums only that day’s expenses', () => {
    expect(spentOn(OCT, '2026-10-02')).toBe(15_000)
    expect(spentOn(OCT, '2026-10-01')).toBe(0)
  })

  it('groups operations by day, newest first', () => {
    const g = groupByDate(OCT.filter((t) => t.date.startsWith('2026-10')))
    expect(g.map((x) => x.date)).toEqual(['2026-10-15', '2026-10-07', '2026-10-05', '2026-10-02', '2026-10-01'])
    expect(g[3].net).toBe(-15_000)
  })
})

describe('categoryBreakdown', () => {
  it('returns categories sorted by amount with share in %', () => {
    const b = categoryBreakdown(OCT, DEFAULT_CATEGORIES, '2026-10')
    expect(b.map((s) => [s.categoryId, s.amount, s.pct])).toEqual([
      ['cat-sport', 25_000, 50],
      ['cat-food', 22_000, 44],
      ['cat-transport', 3_000, 6],
    ])
    expect(b[0]).toMatchObject({ name: 'Спорт/зал', icon: '🏋' })
  })

  it('handles income and unknown categories', () => {
    const inc = categoryBreakdown(OCT, DEFAULT_CATEGORIES, '2026-10', 'income')
    expect(inc.map((s) => s.pct)).toEqual([90.9, 9.1])
    const unknown = categoryBreakdown([tx('expense', 10, '2026-10-01', 'nope')], [], '2026-10')
    expect(unknown[0]).toMatchObject({ name: 'Прочее', pct: 100 })
  })
})

describe('daily allowance', () => {
  const budgets: Budget[] = [
    { id: 'b1', categoryId: 'cat-food', monthlyLimit: 100_000 },
    { id: 'b2', categoryId: 'cat-sport', monthlyLimit: 30_000 },
  ]

  it('month budget = sum of limits, or income when there are none', () => {
    expect(monthBudget(budgets, 550_000)).toBe(130_000)
    expect(monthBudget([], 550_000)).toBe(550_000)
  })

  it('counts remaining days including today', () => {
    expect(remainingDays('2026-10', '2026-10-07')).toBe(25)
    expect(remainingDays('2026-10', '2026-10-31')).toBe(1)
    expect(remainingDays('2026-11', '2026-10-07')).toBe(30)
    expect(remainingDays('2026-09', '2026-10-07')).toBe(0)
  })

  it('(budget − expenses) / days left', () => {
    expect(dailyAllowance(130_000, 50_000, 25)).toBe(3_200)
    expect(dailyAllowance(550_000, 50_000, 25)).toBe(20_000)
    expect(dailyAllowance(10_000, 15_000, 5)).toBe(-1_000)
    expect(dailyAllowance(10_000, 0, 0)).toBeNull()
    expect(dailyAllowance(0, 0, 10)).toBeNull()
  })
})

describe('budgetUsage', () => {
  it('computes percent and colour level (warn > 80 %, danger > 100 %)', () => {
    expect(budgetUsage(40_000, 100_000)).toEqual({ pct: 40, level: 'ok' })
    expect(budgetUsage(80_000, 100_000)).toEqual({ pct: 80, level: 'ok' })
    expect(budgetUsage(81_000, 100_000)).toEqual({ pct: 81, level: 'warn' })
    expect(budgetUsage(100_000, 100_000)).toEqual({ pct: 100, level: 'warn' })
    expect(budgetUsage(125_000, 100_000)).toEqual({ pct: 125, level: 'danger' })
    expect(budgetUsage(1, 3).pct).toBe(33.3)
  })
})

describe('recurring', () => {
  it('totals active payments per month and year', () => {
    const items: RecurringPayment[] = [
      { id: 'r1', name: 'OneFit', amount: 25_000, categoryId: 'cat-sport', dayOfMonth: 5, active: true },
      { id: 'r2', name: 'Spotify', amount: 1_990, categoryId: 'cat-subscriptions', dayOfMonth: 12, active: true },
      { id: 'r3', name: 'Old', amount: 5_000, categoryId: 'cat-other', dayOfMonth: 1, active: false },
    ]
    expect(recurringTotals(items)).toEqual({ monthly: 26_990, yearly: 323_880 })
  })

  it('places the payment on its day in the month', () => {
    expect(recurringDate('2026-10', 5)).toBe('2026-10-05')
    expect(recurringDate('2026-02', 31)).toBe('2026-02-28')
  })
})

describe('savings: monthly contribution', () => {
  it('splits the remaining amount over months left (current month included)', () => {
    expect(monthsUntil('2027-01-31', '2026-10-07')).toBe(4)
    expect(monthlyContribution({ targetAmount: 1_000_000, savedAmount: 200_000, deadline: '2027-01-31' }, '2026-10-07')).toBe(
      200_000,
    )
  })

  it('deadline this month or in the past → all remaining now', () => {
    expect(monthlyContribution({ targetAmount: 100, savedAmount: 40, deadline: '2026-10-20' }, '2026-10-07')).toBe(60)
    expect(monthlyContribution({ targetAmount: 100, savedAmount: 40, deadline: '2025-01-01' }, '2026-10-07')).toBe(60)
  })

  it('rounds up to kopecks, 0 when reached, null without a deadline', () => {
    expect(monthlyContribution({ targetAmount: 100, savedAmount: 0, deadline: '2026-12-01' }, '2026-10-07')).toBe(33.34)
    expect(monthlyContribution({ targetAmount: 100, savedAmount: 150, deadline: '2026-12-01' }, '2026-10-07')).toBe(0)
    expect(monthlyContribution({ targetAmount: 100, savedAmount: 0 }, '2026-10-07')).toBeNull()
  })
})

describe('months', () => {
  it('shifts and labels months', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(monthLabel('2026-10')).toBe('Октябрь 2026')
  })
})
