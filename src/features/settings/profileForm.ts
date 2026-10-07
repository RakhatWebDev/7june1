import type { ActivityLevel, Goal, Profile, Sex } from '../../db/types'

export const SEX_RU: Record<Sex, string> = { male: 'Мужской', female: 'Женский' }

export const ACTIVITY_LEVEL_RU: Record<ActivityLevel, string> = {
  sedentary: 'Сидячий (×1,2)',
  light: 'Низкая активность (×1,375)',
  moderate: 'Средняя активность (×1,55)',
  active: 'Высокая активность (×1,725)',
  very_active: 'Очень высокая (×1,9)',
}

export const GOAL_LABEL_RU: Record<Goal, string> = {
  cut: 'Сушка (−18 %)',
  maintain: 'Поддержание',
  lean_bulk: 'Чистый набор (+10 %)',
}

/** All profile inputs as strings, the way form controls hold them. */
export interface ProfileFormValues {
  name: string
  sex: Sex
  birthYear: string
  heightCm: string
  weightKg: string
  targetWeightKg: string
  activityLevel: ActivityLevel
  goal: Goal
  kcalTargetOverride: string
  proteinPerKg: string
  waterTargetMl: string
  /** Hours, may be fractional (7.5) */
  sleepTargetH: string
}

const str = (n: number | undefined) => (n == null ? '' : String(n))

export function toFormValues(p: Profile): ProfileFormValues {
  return {
    name: p.name ?? '',
    sex: p.sex,
    birthYear: str(p.birthYear),
    heightCm: str(p.heightCm),
    weightKg: str(p.weightKg),
    targetWeightKg: str(p.targetWeightKg),
    activityLevel: p.activityLevel,
    goal: p.goal,
    kcalTargetOverride: str(p.kcalTargetOverride),
    proteinPerKg: str(p.proteinPerKg),
    waterTargetMl: str(p.waterTargetMl),
    sleepTargetH: p.sleepTargetMin == null ? '' : String(Math.round((p.sleepTargetMin / 60) * 100) / 100),
  }
}

type NumberRule = { label: string; min: number; max: number; required: boolean }

const RULES: Record<Exclude<keyof ProfileFormValues, 'name' | 'sex' | 'activityLevel' | 'goal'>, NumberRule> = {
  birthYear: { label: 'Год рождения', min: 1920, max: new Date().getFullYear() - 10, required: true },
  heightCm: { label: 'Рост', min: 100, max: 250, required: true },
  weightKg: { label: 'Вес', min: 30, max: 300, required: true },
  targetWeightKg: { label: 'Целевой вес', min: 30, max: 300, required: false },
  kcalTargetOverride: { label: 'Ккал вручную', min: 800, max: 8000, required: false },
  proteinPerKg: { label: 'Белок на кг', min: 0.5, max: 4, required: false },
  waterTargetMl: { label: 'Вода', min: 500, max: 8000, required: false },
  sleepTargetH: { label: 'Сон', min: 4, max: 12, required: false },
}

export type ProfileErrors = Partial<Record<keyof ProfileFormValues, string>>

/**
 * Converts form values to a Profile. Optional fields left empty are removed from the profile.
 * Returns field errors (Russian) when something is out of range.
 */
export function fromFormValues(
  v: ProfileFormValues,
  now: Date = new Date(),
): { profile: Profile; errors: null } | { profile: null; errors: ProfileErrors } {
  const errors: ProfileErrors = {}
  const nums: Partial<Record<keyof typeof RULES, number>> = {}
  for (const [key, rule] of Object.entries(RULES) as [keyof typeof RULES, NumberRule][]) {
    const raw = v[key].replace(',', '.').trim()
    if (raw === '') {
      if (rule.required) errors[key] = 'Обязательное поле'
      continue
    }
    const n = Number(raw)
    if (!Number.isFinite(n) || n < rule.min || n > rule.max) {
      errors[key] = `От ${rule.min} до ${rule.max}`
      continue
    }
    nums[key] = n
  }
  if (Object.keys(errors).length) return { profile: null, errors }

  const profile: Profile = {
    id: 1,
    name: v.name.trim(),
    sex: v.sex,
    birthYear: Math.round(nums.birthYear!),
    heightCm: nums.heightCm!,
    weightKg: nums.weightKg!,
    activityLevel: v.activityLevel,
    goal: v.goal,
    updatedAt: now.toISOString(),
  }
  if (nums.targetWeightKg != null) profile.targetWeightKg = nums.targetWeightKg
  if (nums.kcalTargetOverride != null) profile.kcalTargetOverride = Math.round(nums.kcalTargetOverride)
  if (nums.proteinPerKg != null) profile.proteinPerKg = nums.proteinPerKg
  if (nums.waterTargetMl != null) profile.waterTargetMl = Math.round(nums.waterTargetMl)
  if (nums.sleepTargetH != null) profile.sleepTargetMin = Math.round(nums.sleepTargetH * 60)
  return { profile, errors: null }
}
