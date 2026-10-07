import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FormaDB } from '../../db'
import { postRecurringForMonth, setBudgetLimit, topUpSavings } from './actions'
import { DEFAULT_CATEGORIES, SAVINGS_CATEGORY_ID, ensureFinanceSeeded } from './seed'

let database: FormaDB

beforeEach(async () => {
  database = new FormaDB(`test-finance-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  await database.delete()
})

describe('ensureFinanceSeeded', () => {
  it('creates built-in categories once, incl. «Накопления», without overwriting', async () => {
    await ensureFinanceSeeded(database)
    expect(await database.txCategories.count()).toBe(DEFAULT_CATEGORIES.length)
    expect(await database.txCategories.get(SAVINGS_CATEGORY_ID)).toMatchObject({ name: 'Накопления', kind: 'expense' })
    expect(await database.txCategories.get('cat-sport')).toMatchObject({ name: 'Спорт/зал', icon: '🏋' })
    await database.txCategories.update('cat-food', { name: 'Кафе' })
    await ensureFinanceSeeded(database)
    expect(await database.txCategories.count()).toBe(DEFAULT_CATEGORIES.length)
    expect((await database.txCategories.get('cat-food'))?.name).toBe('Кафе')
    expect(DEFAULT_CATEGORIES.every((c) => c.id.startsWith('cat-'))).toBe(true)
  })
})

describe('postRecurringForMonth', () => {
  beforeEach(async () => {
    await database.recurring.bulkAdd([
      { id: 'r-onefit', name: 'OneFit', amount: 25_000, categoryId: 'cat-sport', dayOfMonth: 5, active: true },
      { id: 'r-spotify', name: 'Spotify', amount: 1_990, categoryId: 'cat-subscriptions', dayOfMonth: 28, active: true },
      { id: 'r-off', name: 'Старое', amount: 3_000, categoryId: 'cat-other', dayOfMonth: 1, active: false },
    ])
  })

  it('creates one transaction per active payment with recurringId and is idempotent for the month', async () => {
    expect(await postRecurringForMonth('2026-10', database)).toBe(2)
    const txs = await database.transactions.orderBy('date').toArray()
    expect(txs.map((t) => [t.recurringId, t.date, t.amount, t.kind, t.categoryId])).toEqual([
      ['r-onefit', '2026-10-05', 25_000, 'expense', 'cat-sport'],
      ['r-spotify', '2026-10-28', 1_990, 'expense', 'cat-subscriptions'],
    ])

    expect(await postRecurringForMonth('2026-10', database)).toBe(0)
    expect(await database.transactions.count()).toBe(2)
  })

  it('posts only missing payments, and again for another month', async () => {
    await database.transactions.add({
      id: 'manual',
      kind: 'expense',
      amount: 25_000,
      categoryId: 'cat-sport',
      date: '2026-10-09',
      recurringId: 'r-onefit',
      createdAt: '2026-10-09T10:00:00Z',
    })
    expect(await postRecurringForMonth('2026-10', database)).toBe(1)
    expect(await database.transactions.where('recurringId').equals('r-onefit').count()).toBe(1)

    expect(await postRecurringForMonth('2026-11', database)).toBe(2)
    expect(await database.transactions.count()).toBe(4)
  })
})

describe('topUpSavings', () => {
  it('increases savedAmount and records an expense in «Накопления»', async () => {
    await database.savingsGoals.add({
      id: 'g1',
      name: 'Подушка',
      icon: '🏦',
      targetAmount: 1_000_000,
      savedAmount: 100_000,
      createdAt: '2026-10-01T00:00:00Z',
    })
    await topUpSavings({ id: 'g1', name: 'Подушка' }, 50_000, '2026-10-07', database)
    expect((await database.savingsGoals.get('g1'))?.savedAmount).toBe(150_000)
    const [t] = await database.transactions.toArray()
    expect(t).toMatchObject({ kind: 'expense', amount: 50_000, categoryId: SAVINGS_CATEGORY_ID, date: '2026-10-07' })
  })
})

describe('setBudgetLimit', () => {
  it('keeps one budget per category and removes it at 0', async () => {
    await setBudgetLimit('cat-food', 100_000, database)
    await setBudgetLimit('cat-food', 120_000, database)
    expect(await database.budgets.toArray()).toEqual([{ id: 'budget-cat-food', categoryId: 'cat-food', monthlyLimit: 120_000 }])
    await setBudgetLimit('cat-food', 0, database)
    expect(await database.budgets.count()).toBe(0)
  })
})
