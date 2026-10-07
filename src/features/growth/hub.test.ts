import { describe, expect, it } from 'vitest'
import { currencySymbol, goalProgress, goalsSummary, money, monthExpenses, moodBySlot } from './hub'

describe('hub helpers', () => {
  it('currency symbol with ₸ default', () => {
    expect(currencySymbol('RUB')).toBe('₽')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('EUR')).toBe('€')
    expect(currencySymbol(undefined)).toBe('₸')
    expect(currencySymbol('XXX')).toBe('₸')
    expect(money(12500, '₸').replace(/\s/g, ' ')).toBe('12 500 ₸')
  })

  it('sums expenses of the month only', () => {
    const txs = [
      { kind: 'expense' as const, amount: 1000, date: '2026-10-01' },
      { kind: 'expense' as const, amount: 2500, date: '2026-10-07' },
      { kind: 'income' as const, amount: 9000, date: '2026-10-05' },
      { kind: 'expense' as const, amount: 700, date: '2026-09-30' },
    ]
    expect(monthExpenses(txs, '2026-10')).toEqual({ total: 3500, count: 2 })
  })

  it('goal progress: mean of clamped current/target', () => {
    const kr = (current: number, target: number) => ({ id: 'k', title: 'k', current, target })
    expect(goalProgress({ keyResults: [kr(5, 10), kr(20, 10), kr(3, 0)] })).toBeCloseTo((0.5 + 1 + 0) / 3)
    expect(goalProgress({ keyResults: [] })).toBeNull()
    const s = goalsSummary([
      { status: 'active', keyResults: [kr(5, 10)] },
      { status: 'active', keyResults: [kr(1, 4)] },
      { status: 'active', keyResults: [] },
      { status: 'done', keyResults: [kr(10, 10)] },
    ])
    expect(s.active).toBe(3)
    expect(s.avgProgress).toBeCloseTo(0.375)
    expect(goalsSummary([]).avgProgress).toBeNull()
  })

  it('latest mood per slot', () => {
    expect(
      moodBySlot([
        { slot: 'morning', mood: 2, createdAt: '2026-10-07T07:00:00Z' },
        { slot: 'morning', mood: 4, createdAt: '2026-10-07T08:00:00Z' },
      ]),
    ).toEqual({ morning: 4 })
  })
})
