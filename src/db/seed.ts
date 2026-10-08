import { db } from './index'
import { builtInPrograms } from '../data/programs'
import { ensureProgramSettingsSeeded } from '../data/programs/maxes'
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

/** settings key of a program's cycle state (same as features/workouts/schedule `cycleKey`) */
const cycleKey = (programId: string) => `program.cycle:${programId}`

/**
 * Idempotent: creates the profile if missing and upserts built-in programs
 * (user-created programs are never touched); seeds lift maxes and the default active program if absent.
 * When a stored built-in program has a different `version`, its cycle state (week, rotation) is reset.
 */
export async function ensureSeeded(database = db): Promise<void> {
  await database.transaction('rw', database.profile, database.programs, database.settings, async () => {
    const profile = await database.profile.get(1)
    if (!profile) await database.profile.put(DEFAULT_PROFILE)
    for (const p of builtInPrograms) {
      const stored = await database.programs.get(p.id)
      if (stored && stored.version !== p.version) await database.settings.delete(cycleKey(p.id))
      await database.programs.put(p)
    }
  })
  await ensureProgramSettingsSeeded(database)
  await ensureFinanceSeeded(database)
  await ensureHabitsSeeded(database)
  await ensureGoalsSeeded(database)
}
