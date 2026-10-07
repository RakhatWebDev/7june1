import { db, type FormaDB } from '../../db'
import type { Food } from '../../db/types'

type Row = [slug: string, name: string, kcal: number, proteinG: number, fatG: number, carbsG: number, servingG?: number]

/**
 * Starter food library, values per 100 g (or 100 ml) of the product as sold / raw unless
 * stated otherwise. Sources: USDA FoodData Central and Russian composition tables (Скурихин).
 */
const ROWS: Row[] = [
  // Meat, fish, eggs
  ['chicken-breast', 'Куриная грудка (филе, сырое)', 113, 23.6, 1.9, 0.4, 150],
  ['turkey-breast', 'Индейка, филе грудки (сырое)', 114, 23.7, 1.5, 0, 150],
  ['beef-lean', 'Говядина постная (сырая)', 158, 22.2, 7.1, 0, 150],
  ['pork-tenderloin', 'Свинина, вырезка (сырая)', 120, 21, 3.5, 0, 150],
  ['salmon', 'Лосось атлантический (сырой)', 208, 20.4, 13.4, 0, 150],
  ['cod', 'Треска (сырая)', 82, 17.8, 0.7, 0, 150],
  ['tuna-canned', 'Тунец консервированный в собственном соку', 116, 25.5, 0.8, 0, 120],
  ['egg', 'Яйцо куриное', 157, 12.7, 11.5, 0.7, 55],
  ['egg-white', 'Яичный белок', 48, 11.1, 0, 1, 33],
  // Dairy
  ['cottage-cheese-5', 'Творог 5%', 121, 17.2, 5, 1.8, 200],
  ['cottage-cheese-0', 'Творог обезжиренный', 79, 16.5, 0.6, 1.3, 200],
  ['milk-2-5', 'Молоко 2,5%', 52, 2.8, 2.5, 4.7, 250],
  ['kefir-1', 'Кефир 1%', 40, 2.8, 1, 4, 250],
  ['greek-yogurt-2', 'Греческий йогурт 2%', 73, 10, 2, 3.9, 150],
  ['hard-cheese', 'Сыр твёрдый (Российский)', 363, 24.1, 29.5, 0.3, 30],
  ['sour-cream-15', 'Сметана 15%', 158, 2.6, 15, 3, 30],
  ['butter', 'Масло сливочное 82,5%', 748, 0.5, 82.5, 0.8, 10],
  ['whey-protein', 'Протеин сывороточный (порошок)', 400, 78, 6, 9, 30],
  // Grains, legumes, starches
  ['rice-white-dry', 'Рис белый (сухой)', 344, 6.7, 0.7, 78.9, 70],
  ['rice-white-cooked', 'Рис белый варёный', 130, 2.7, 0.3, 28.2, 150],
  ['buckwheat-dry', 'Гречка (сухая)', 313, 12.6, 3.3, 62.1, 70],
  ['buckwheat-cooked', 'Гречка варёная', 110, 4.2, 1.1, 21.3, 150],
  ['oats', 'Овсяные хлопья', 352, 12.3, 6.2, 61.8, 50],
  ['pasta-dry', 'Макароны из твёрдых сортов (сухие)', 350, 12.5, 1.5, 71, 80],
  ['bread-white', 'Хлеб белый', 265, 9, 3.2, 49, 30],
  ['bread-wholegrain', 'Хлеб цельнозерновой', 247, 13, 3.4, 41, 30],
  ['rice-cakes', 'Хлебцы рисовые', 387, 8, 2.8, 81.5, 10],
  ['lentils-dry', 'Чечевица (сухая)', 352, 24.6, 1.1, 63.4, 70],
  ['chickpeas-dry', 'Нут (сухой)', 364, 19.3, 6, 60.7, 70],
  ['potato', 'Картофель', 77, 2, 0.1, 17, 200],
  ['sweet-potato', 'Батат', 86, 1.6, 0.1, 20.1, 200],
  // Fruit and vegetables
  ['banana', 'Банан', 89, 1.1, 0.3, 22.8, 120],
  ['apple', 'Яблоко', 52, 0.3, 0.2, 13.8, 180],
  ['orange', 'Апельсин', 47, 0.9, 0.1, 11.8, 150],
  ['blueberries', 'Черника', 57, 0.7, 0.3, 14.5, 100],
  ['avocado', 'Авокадо', 160, 2, 14.7, 8.5, 70],
  ['broccoli', 'Брокколи', 34, 2.8, 0.4, 6.6, 150],
  ['cucumber', 'Огурец', 15, 0.7, 0.1, 3.6, 100],
  ['tomato', 'Помидор', 18, 0.9, 0.2, 3.9, 100],
  // Fats, nuts, sweet
  ['olive-oil', 'Масло оливковое', 884, 0, 100, 0, 10],
  ['walnuts', 'Грецкие орехи', 654, 15.2, 65.2, 13.7, 30],
  ['almonds', 'Миндаль', 579, 21.2, 49.9, 21.6, 30],
  ['peanut-butter', 'Арахисовая паста', 588, 25, 50, 20, 20],
  ['honey', 'Мёд', 304, 0.3, 0, 82.4, 15],
]

export const BUILT_IN_FOODS: Food[] = ROWS.map(([slug, name, kcal, proteinG, fatG, carbsG, servingG]) => ({
  id: `builtin-${slug}`,
  name,
  kcal,
  proteinG,
  fatG,
  carbsG,
  servingG,
  isBuiltIn: true,
}))

/**
 * Idempotent: adds any built-in foods missing from `foods` (by stable id). Existing rows are left
 * untouched, so repeated calls cause no writes and do not wake live queries.
 */
export async function ensureBuiltInFoods(database: FormaDB = db): Promise<number> {
  const ids = BUILT_IN_FOODS.map((f) => f.id)
  const existing = await database.foods.bulkGet(ids)
  const missing = BUILT_IN_FOODS.filter((_, i) => !existing[i])
  if (missing.length > 0) await database.foods.bulkPut(missing)
  return missing.length
}
