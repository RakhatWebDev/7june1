import type { IconName } from '../../components/icons'
import type { Activity, ActivityType } from '../../db/types'

/** Metabolic equivalents per activity type (Compendium of Physical Activities, rounded). */
export const MET: Record<ActivityType, number> = {
  run: 9.8,
  bike: 7.5,
  swim: 8.0,
  rope: 11.0,
  walk: 3.5,
  stretch: 2.5,
  hiit: 10.0,
  other: 5.0,
}

export const ACTIVITY_TYPES: ActivityType[] = ['run', 'bike', 'swim', 'rope', 'walk', 'stretch', 'hiit', 'other']

export const ACTIVITY_RU: Record<ActivityType, string> = {
  run: 'Бег',
  bike: 'Велосипед',
  swim: 'Бассейн',
  rope: 'Скакалка',
  walk: 'Ходьба',
  stretch: 'Растяжка',
  hiit: 'HIIT',
  other: 'Другое',
}

/** Line icon per activity type (rendered via `IconBadge`, cardio tone `info`). */
export const ACTIVITY_ICON: Record<ActivityType, IconName> = {
  run: 'run',
  bike: 'bike',
  swim: 'swim',
  rope: 'rope',
  walk: 'activity',
  stretch: 'stretch',
  hiit: 'flame',
  other: 'sparkles',
}

/** Types for which a distance makes sense. */
export const DISTANCE_TYPES: ActivityType[] = ['run', 'bike', 'swim', 'walk']

export function hasDistance(type: ActivityType): boolean {
  return DISTANCE_TYPES.includes(type)
}

export function isActivityType(v: unknown): v is ActivityType {
  return typeof v === 'string' && (ACTIVITY_TYPES as string[]).includes(v)
}

/** kcal = MET × body weight (kg) × hours, rounded. Returns null when inputs are missing. */
export function estimateKcal(
  type: ActivityType,
  durationMin: number | null | undefined,
  weightKg: number | null | undefined,
): number | null {
  if (!durationMin || durationMin <= 0 || !weightKg || weightKg <= 0) return null
  return Math.round(MET[type] * weightKg * (durationMin / 60))
}

export interface Pace {
  /** Minutes per unit (per km for running, per 100 m for swimming) */
  minPerUnit: number
  unit: 'км' | '100 м'
}

/** Pace for running (min/km) and swimming (min/100 m); null for other types or missing data. */
export function pace(
  type: ActivityType,
  durationMin: number | null | undefined,
  distanceKm: number | null | undefined,
): Pace | null {
  if (!durationMin || durationMin <= 0 || !distanceKm || distanceKm <= 0) return null
  if (type === 'run') return { minPerUnit: durationMin / distanceKm, unit: 'км' }
  if (type === 'swim') return { minPerUnit: durationMin / (distanceKm * 10), unit: '100 м' }
  return null
}

/** 5.5 → "5:30" */
export function formatPaceValue(minPerUnit: number): string {
  let totalSec = Math.round(minPerUnit * 60)
  const m = Math.floor(totalSec / 60)
  totalSec -= m * 60
  return `${m}:${totalSec.toString().padStart(2, '0')}`
}

export function formatPace(p: Pace): string {
  return `${formatPaceValue(p.minPerUnit)} мин/${p.unit}`
}

export interface TypeSummary {
  count: number
  minutes: number
  km: number
}

export interface WeekSummary {
  count: number
  minutes: number
  km: number
  kcal: number
  byType: Partial<Record<ActivityType, TypeSummary>>
}

/** Aggregates activities whose `date` lies in [from, to] (inclusive, YYYY-MM-DD). */
export function summarize(activities: Activity[], from: string, to: string): WeekSummary {
  const res: WeekSummary = { count: 0, minutes: 0, km: 0, kcal: 0, byType: {} }
  for (const a of activities) {
    if (a.date < from || a.date > to) continue
    res.count += 1
    res.minutes += a.durationMin || 0
    res.km += a.distanceKm || 0
    res.kcal += a.kcal || 0
    const t = (res.byType[a.type] ??= { count: 0, minutes: 0, km: 0 })
    t.count += 1
    t.minutes += a.durationMin || 0
    t.km += a.distanceKm || 0
  }
  res.km = Number(res.km.toFixed(2))
  return res
}

/** Body weight for estimates: latest `weights` entry, otherwise the profile weight. */
export function pickWeight(
  latestWeightKg: number | null | undefined,
  profileWeightKg: number | null | undefined,
): number | null {
  if (latestWeightKg && latestWeightKg > 0) return latestWeightKg
  if (profileWeightKg && profileWeightKg > 0) return profileWeightKg
  return null
}
