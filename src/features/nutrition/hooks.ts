import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { ensureBuiltInFoods } from './builtInFoods'
import { computeTargets, currentWeightKg, type Targets } from './calc'
import type { Profile } from '../../db/types'

export interface NutritionContext {
  profile: Profile
  weightKg: number
  /** True when the weight comes from the latest `weights` entry rather than the profile */
  weightFromLog: boolean
  targets: Targets
}

/** Profile + current weight + computed targets. `undefined` while loading or without a profile. */
export function useNutritionTargets(): NutritionContext | null | undefined {
  return useLiveQuery(async () => {
    const profile = await db.profile.get(1)
    if (!profile) return null
    const last = await db.weights.orderBy('date').last()
    const weightKg = currentWeightKg(profile, last ? [last] : [])
    return { profile, weightKg, weightFromLog: !!last, targets: computeTargets(profile, weightKg) }
  }, [])
}

/** Seeds the built-in food library once per mount (idempotent). */
export function useBuiltInFoodsSeed(): void {
  useEffect(() => {
    ensureBuiltInFoods().catch((e) => console.error('Failed to seed built-in foods', e))
  }, [])
}

/** Parses a number from a text input, accepting a comma as the decimal separator. */
export function parseNum(s: string): number {
  const n = Number(s.replace(',', '.').trim())
  return Number.isFinite(n) ? n : NaN
}
