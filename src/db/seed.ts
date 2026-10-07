import { db } from './index'
import { builtInPrograms } from '../data/programs'
import type { Profile } from './types'
import { ensureFinanceSeeded } from '../features/finance/seed'
import { ensureHabitsSeeded } from '../features/growth/habits/seed'
import { ensureGoalsSeeded } from '../features/goals/seed'

export const DEFAULT_PROFILE: Profile = {
  id: 1,
  name: 'Рахат',
  sex: 'male',
  birthYear: 2000,
  heightCm: 183,
  weightKg: 88,
  targetWeightKg: 82,
  activityLevel: 'active',
  goal: 'cut',
  proteinPerKg: 2.0,
  waterTargetMl: 3000,
  sleepTargetMin: 8 * 60,
  updatedAt: new Date().toISOString(),
}

/**
 * Idempotent: creates the profile if missing and upserts built-in programs
 * (user-created programs are never touched).
 */
export async function ensureSeeded(database = db): Promise<void> {
  await database.transaction('rw', database.profile, database.programs, async () => {
    const profile = await database.profile.get(1)
    if (!profile) await database.profile.put(DEFAULT_PROFILE)
    for (const p of builtInPrograms) await database.programs.put(p)
  })
  await ensureFinanceSeeded(database)
  await ensureHabitsSeeded(database)
  await ensureGoalsSeeded(database)
}
