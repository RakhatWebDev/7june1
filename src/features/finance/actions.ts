import { db as defaultDb, type FormaDB } from '../../db'
import type { ISODate, SavingsGoal } from '../../db/types'
import { newId } from '../../lib/id'
import { monthRange, recurringDate, type MonthKey } from './calc'
import { SAVINGS_CATEGORY_ID } from './seed'

/**
 * Creates a transaction for every active recurring payment in `month`.
 * Idempotent: a payment that already has a transaction with its `recurringId`
 * inside the month is skipped. Returns the number of created transactions.
 */
export async function postRecurringForMonth(month: MonthKey, database: FormaDB = defaultDb): Promise<number> {
  const { from, to } = monthRange(month)
  return database.transaction('rw', database.recurring, database.transactions, async () => {
    const items = (await database.recurring.toArray()).filter((r) => r.active && r.amount > 0)
    const monthTxs = await database.transactions.where('date').between(from, to, true, true).toArray()
    const posted = new Set(monthTxs.map((t) => t.recurringId).filter(Boolean))
    const createdAt = new Date().toISOString()
    let created = 0
    for (const r of items) {
      if (posted.has(r.id)) continue
      await database.transactions.add({
        id: newId(),
        kind: 'expense',
        amount: r.amount,
        categoryId: r.categoryId,
        date: recurringDate(month, r.dayOfMonth),
        note: r.name,
        recurringId: r.id,
        createdAt,
      })
      created++
    }
    return created
  })
}

/** Adds `amount` to a savings goal and records it as an expense in «Накопления». */
export async function topUpSavings(
  goal: Pick<SavingsGoal, 'id' | 'name'>,
  amount: number,
  date: ISODate,
  database: FormaDB = defaultDb,
): Promise<void> {
  if (!(amount > 0)) return
  await database.transaction('rw', database.savingsGoals, database.transactions, async () => {
    const current = await database.savingsGoals.get(goal.id)
    if (!current) return
    await database.savingsGoals.update(goal.id, {
      savedAmount: Math.round((current.savedAmount + amount) * 100) / 100,
    })
    await database.transactions.add({
      id: newId(),
      kind: 'expense',
      amount,
      categoryId: SAVINGS_CATEGORY_ID,
      date,
      note: `${current.icon} ${current.name}`.trim(),
      createdAt: new Date().toISOString(),
    })
  })
}

/** Sets (or removes, when limit ≤ 0) the monthly limit of a category; one budget per category. */
export async function setBudgetLimit(categoryId: string, limit: number, database: FormaDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.budgets, async () => {
    const existing = await database.budgets.where('categoryId').equals(categoryId).toArray()
    if (limit > 0) {
      await database.budgets.put({ id: existing[0]?.id ?? `budget-${categoryId}`, categoryId, monthlyLimit: limit })
      if (existing.length > 1) await database.budgets.bulkDelete(existing.slice(1).map((b) => b.id))
    } else if (existing.length) {
      await database.budgets.bulkDelete(existing.map((b) => b.id))
    }
  })
}
