import type { ActivityLevel, Food, FoodEntry, Goal, MealType, Profile, WeightEntry } from '../../db/types'

/** Mifflin–St Jeor activity multipliers (BMR → TDEE). */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

/** Relative kcal adjustment applied to TDEE for each goal. */
export const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  cut: -0.18,
  maintain: 0,
  lean_bulk: 0.1,
}

export const DEFAULT_PROTEIN_PER_KG = 2.0
export const FAT_PER_KG = 0.9
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const

export const ACTIVITY_RU: Record<ActivityLevel, string> = {
  sedentary: 'Сидячий образ жизни',
  light: 'Низкая активность',
  moderate: 'Средняя активность',
  active: 'Высокая активность',
  very_active: 'Очень высокая активность',
}

export const GOAL_RU: Record<Goal, string> = {
  cut: 'Сушка',
  maintain: 'Поддержание',
  lean_bulk: 'Чистый набор',
}

export const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
export const MEAL_RU: Record<MealType, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
}

export interface Targets {
  bmr: number
  tdee: number
  kcal: number
  proteinG: number
  fatG: number
  carbsG: number
}

export interface Macros {
  kcal: number
  proteinG: number
  fatG: number
  carbsG: number
}

/** Age in full years as "current year − birthYear". */
export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear
}

/** Basal metabolic rate (Mifflin–St Jeor), unrounded. */
export function mifflinStJeor(sex: Profile['sex'], weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)
}

/**
 * Daily nutrition targets for a profile at the given bodyweight. All values are integers.
 * `now` only exists to make the age deterministic in tests.
 */
export function computeTargets(profile: Profile, weightKg: number, now: Date = new Date()): Targets {
  const age = ageFromBirthYear(profile.birthYear, now)
  const bmrRaw = mifflinStJeor(profile.sex, weightKg, profile.heightCm, age)
  const tdeeRaw = bmrRaw * (ACTIVITY_MULTIPLIERS[profile.activityLevel] ?? 1.2)
  const goalKcal = tdeeRaw * (1 + (GOAL_ADJUSTMENTS[profile.goal] ?? 0))
  const kcal = Math.round(
    profile.kcalTargetOverride != null && profile.kcalTargetOverride > 0 ? profile.kcalTargetOverride : goalKcal,
  )
  const proteinG = Math.round((profile.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG) * weightKg)
  const fatG = Math.round(FAT_PER_KG * weightKg)
  const carbsG = Math.max(
    0,
    Math.round((kcal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat) / KCAL_PER_G.carbs),
  )
  return { bmr: Math.round(bmrRaw), tdee: Math.round(tdeeRaw), kcal, proteinG, fatG, carbsG }
}

/** Current bodyweight: latest `weights` entry by date, else the profile weight. */
export function currentWeightKg(profile: Pick<Profile, 'weightKg'>, weights: WeightEntry[] | undefined): number {
  if (!weights || weights.length === 0) return profile.weightKg
  let latest = weights[0]
  for (const w of weights) if (w.date >= latest.date) latest = w
  return latest.weightKg
}

/** Round to 1 decimal, absorbing float noise first (1.9 × 1.5 = 2.8499999… → 2.9). */
const round1 = (n: number) => Math.round(Number((n * 10).toPrecision(12))) / 10

/** Macros of `grams` of a food whose values are per 100 g. kcal integer, macros 1 decimal. */
export function scaleFood(food: Pick<Food, 'kcal' | 'proteinG' | 'fatG' | 'carbsG'>, grams: number): Macros {
  const k = (Number.isFinite(grams) && grams > 0 ? grams : 0) / 100
  return {
    kcal: Math.round(Number((food.kcal * k).toPrecision(12))),
    proteinG: round1(food.proteinG * k),
    fatG: round1(food.fatG * k),
    carbsG: round1(food.carbsG * k),
  }
}

/** Sum of macros over diary entries (rounded the same way as scaleFood). */
export function sumMacros(entries: Pick<FoodEntry, 'kcal' | 'proteinG' | 'fatG' | 'carbsG'>[]): Macros {
  const t = entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + (e.kcal || 0),
      proteinG: acc.proteinG + (e.proteinG || 0),
      fatG: acc.fatG + (e.fatG || 0),
      carbsG: acc.carbsG + (e.carbsG || 0),
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  )
  return { kcal: Math.round(t.kcal), proteinG: round1(t.proteinG), fatG: round1(t.fatG), carbsG: round1(t.carbsG) }
}
