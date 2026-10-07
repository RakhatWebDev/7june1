import { db as defaultDb, type FormaDB } from '../../db'
import type { LifeGoal } from '../../db/types'
import type { GoalKeyResult } from './calc'

export const GOALS_SEEDED_KEY = 'goalsSeeded'
export const STARTER_GOAL_ID = 'goal-aesthetic-body'

const starterKeyResults: GoalKeyResult[] = [
  { id: 'kr-weight', title: 'Вес', start: 88, current: 88, target: 82, unit: 'кг' },
  {
    id: 'kr-workouts',
    title: 'Тренировок в неделю',
    start: 0,
    current: 0,
    target: 5,
    unit: 'трен.',
  },
  { id: 'kr-sleep', title: 'Сон', start: 0, current: 0, target: 8, unit: 'ч' },
]

export function starterGoal(createdAt = new Date().toISOString()): LifeGoal {
  return {
    id: STARTER_GOAL_ID,
    area: 'body',
    title: 'Эстетичное тело',
    why: 'Чувствовать себя сильным, лёгким и уверенным',
    status: 'active',
    keyResults: starterKeyResults,
    habitIds: ['habit-workout', 'habit-sleep'],
    sort: 0,
    createdAt,
  }
}

/**
 * Creates the starter goal once, only when there are no goals yet. A settings
 * flag remembers that the seed ran, so a deleted starter goal is not recreated.
 */
export async function ensureGoalsSeeded(database: FormaDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.lifeGoals, database.settings, async () => {
    if (await database.settings.get(GOALS_SEEDED_KEY)) return
    if ((await database.lifeGoals.count()) === 0) await database.lifeGoals.add(starterGoal())
    await database.settings.put({ key: GOALS_SEEDED_KEY, value: true })
  })
}
