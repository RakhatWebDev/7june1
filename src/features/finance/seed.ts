import { db as defaultDb, type FormaDB } from '../../db'
import type { TxCategory } from '../../db/types'

export const SAVINGS_CATEGORY_ID = 'cat-savings'

const expense = (id: string, name: string, icon: string, color: string, sort: number): TxCategory => ({
  id,
  name,
  icon,
  kind: 'expense',
  color,
  sort,
  isBuiltIn: true,
})
const income = (id: string, name: string, icon: string, color: string, sort: number): TxCategory => ({
  id,
  name,
  icon,
  kind: 'income',
  color,
  sort,
  isBuiltIn: true,
})

export const DEFAULT_CATEGORIES: TxCategory[] = [
  expense('cat-food', 'Еда', '🍔', '#f97316', 0),
  expense('cat-groceries', 'Продукты', '🛒', '#a3e635', 1),
  expense('cat-sport', 'Спорт/зал', '🏋', '#22d3ee', 2),
  expense('cat-transport', 'Транспорт', '🚗', '#60a5fa', 3),
  expense('cat-housing', 'Жильё', '🏠', '#a78bfa', 4),
  expense('cat-health', 'Здоровье', '💊', '#f87171', 5),
  expense('cat-clothes', 'Одежда', '👕', '#f472b6', 6),
  expense('cat-fun', 'Развлечения', '🎮', '#fbbf24', 7),
  expense('cat-education', 'Образование', '📚', '#34d399', 8),
  expense('cat-subscriptions', 'Подписки', '📱', '#818cf8', 9),
  expense('cat-gifts', 'Подарки', '🎁', '#fb7185', 10),
  expense(SAVINGS_CATEGORY_ID, 'Накопления', '🏦', '#2dd4bf', 11),
  expense('cat-other', 'Прочее', '📦', '#94a3b8', 12),
  income('cat-salary', 'Зарплата', '💼', '#a3e635', 0),
  income('cat-freelance', 'Фриланс', '💻', '#60a5fa', 1),
  income('cat-gifts-in', 'Подарки', '🎁', '#fb7185', 2),
  income('cat-invest', 'Инвестиции', '📈', '#34d399', 3),
  income('cat-other-in', 'Прочее', '💰', '#94a3b8', 4),
]

/** Adds missing built-in categories. Idempotent; never overwrites existing rows. */
export async function ensureFinanceSeeded(database: FormaDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.txCategories, async () => {
    const existing = new Set(await database.txCategories.toCollection().primaryKeys())
    const missing = DEFAULT_CATEGORIES.filter((c) => !existing.has(c.id))
    if (missing.length) await database.txCategories.bulkAdd(missing)
  })
}
