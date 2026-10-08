import { db as defaultDb, type FormaDB } from '../../../db'
import type { Habit } from '../../../db/types'

export const HABITS_SEEDED_KEY = 'habitsSeeded'

type SeedHabit = Omit<Habit, 'createdAt' | 'archived'>

export const DEFAULT_HABITS: SeedHabit[] = [
  { id: 'habit-workout', name: 'Тренировка', icon: '🏋', color: 'accent', frequency: 'weekly', targetPerWeek: 3, autoRule: 'workout', sort: 0 },
  { id: 'habit-cardio', name: 'Кардио', icon: '🏃', color: 'info', frequency: 'weekly', targetPerWeek: 3, autoRule: 'cardio', sort: 1 },
  { id: 'habit-water', name: '3 л воды', icon: '💧', color: 'info', frequency: 'daily', autoRule: 'water', sort: 2 },
  { id: 'habit-sleep', name: 'Сон до 23:30', icon: '🌙', color: 'violet', frequency: 'daily', autoRule: 'sleep', sort: 3 },
  { id: 'habit-reading', name: 'Чтение 20 мин', icon: '📖', color: 'warn', frequency: 'daily', autoRule: 'reading', sort: 4 },
  { id: 'habit-stretch', name: 'Растяжка', icon: '🧘', color: 'pink', frequency: 'weekly', targetPerWeek: 3, autoRule: 'stretch', sort: 5 },
  { id: 'habit-no-sugar', name: 'Без сахара', icon: '🍬', color: 'danger', frequency: 'daily', autoRule: null, sort: 6 },
  { id: 'habit-steps', name: '10 000 шагов', icon: '👟', color: 'accent', frequency: 'daily', autoRule: null, sort: 7 },
]

/**
 * Creates the default habits once. Idempotent: a settings flag records that the
 * seed ran, so habits the user deleted are not resurrected; existing ids are never overwritten.
 */
export async function ensureHabitsSeeded(database: FormaDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.habits, database.settings, async () => {
    if (await database.settings.get(HABITS_SEEDED_KEY)) return
    const createdAt = new Date().toISOString()
    for (const h of DEFAULT_HABITS) {
      if (!(await database.habits.get(h.id))) await database.habits.add({ ...h, archived: false, createdAt })
    }
    await database.settings.put({ key: HABITS_SEEDED_KEY, value: true })
  })
}
