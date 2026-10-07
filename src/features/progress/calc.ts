import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns'
import type { Activity, Measurement, SetLog, WeightEntry, WorkoutSession } from '../../db/types'
import { fromISODate, toISODate } from '../../lib/dates'

/* ------------------------------------------------------------------ */
/* Pure calculations for the progress screen. No DB access here.      */
/* ------------------------------------------------------------------ */

const round1 = (n: number) => Math.round(n * 10) / 10

/** Local calendar day of an ISO timestamp. */
export function sessionDate(s: Pick<WorkoutSession, 'startedAt'>): string {
  return toISODate(new Date(s.startedAt))
}

/* ----------------------------- Weight ----------------------------- */

export interface WeightPoint {
  date: string
  weightKg: number
  /** Mean of all entries within the trailing `windowDays` calendar days (inclusive) */
  avgKg: number
}

/**
 * Trailing moving average by calendar days: for every entry, average all entries whose date lies in
 * (date − windowDays, date]. Several entries on one day are averaged first.
 */
export function movingAverage(entries: Pick<WeightEntry, 'date' | 'weightKg'>[], windowDays = 7): WeightPoint[] {
  const byDay = new Map<string, number[]>()
  for (const e of entries) {
    if (!Number.isFinite(e.weightKg)) continue
    const list = byDay.get(e.date) ?? []
    list.push(e.weightKg)
    byDay.set(e.date, list)
  }
  const days = [...byDay.entries()]
    .map(([date, ws]) => ({ date, weightKg: ws.reduce((a, b) => a + b, 0) / ws.length }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return days.map((d, i) => {
    const end = fromISODate(d.date)
    let sum = 0
    let n = 0
    for (let j = i; j >= 0; j--) {
      if (differenceInCalendarDays(end, fromISODate(days[j].date)) >= windowDays) break
      sum += days[j].weightKg
      n++
    }
    return { date: d.date, weightKg: round1(d.weightKg), avgKg: round1(sum / n) }
  })
}

/* ---------------------------- Volume ------------------------------ */

export function setVolume(s: SetLog): number {
  if (!s.done || s.warmup || s.weightKg == null || s.reps == null) return 0
  return s.weightKg * s.reps
}

export function sessionVolume(session: Pick<WorkoutSession, 'exercises'>): number {
  let total = 0
  for (const ex of session.exercises) for (const s of ex.sets) total += setVolume(s)
  return total
}

/** Epley estimated one-rep max: w × (1 + reps / 30). */
export function epley1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30)
}

export interface WeekVolume {
  /** Monday of the week, YYYY-MM-DD */
  weekStart: string
  /** Short label "dd.MM" */
  label: string
  volumeKg: number
  sessions: number
}

/**
 * Volume (kg) and number of workouts per Monday-based week for the last `weeks` weeks, oldest first,
 * the last bucket being the week that contains `now`. Unfinished sessions count too (their done sets).
 */
export function weeklyVolume(
  sessions: Pick<WorkoutSession, 'startedAt' | 'exercises'>[],
  weeks = 12,
  now: Date = new Date(),
): WeekVolume[] {
  const currentMonday = startOfWeek(now, { weekStartsOn: 1 })
  const buckets: WeekVolume[] = Array.from({ length: weeks }, (_, i) => {
    const monday = addDays(currentMonday, (i - weeks + 1) * 7)
    const iso = toISODate(monday)
    return { weekStart: iso, label: `${iso.slice(8, 10)}.${iso.slice(5, 7)}`, volumeKg: 0, sessions: 0 }
  })
  const index = new Map(buckets.map((b, i) => [b.weekStart, i]))
  for (const s of sessions) {
    const monday = toISODate(startOfWeek(new Date(s.startedAt), { weekStartsOn: 1 }))
    const i = index.get(monday)
    if (i == null) continue
    buckets[i].volumeKg += sessionVolume(s)
    buckets[i].sessions += 1
  }
  for (const b of buckets) b.volumeKg = Math.round(b.volumeKg)
  return buckets
}

/* --------------------------- Records ------------------------------ */

export interface PersonalRecord {
  exerciseId: string
  name: string
  maxWeightKg: number
  /** Reps done with the max weight (best of them) */
  maxWeightReps: number
  maxWeightDate: string
  best1RM: number
  best1RMDate: string
}

/**
 * Best working sets per exercise across all sessions: heaviest weight and best Epley 1RM.
 * Only `done && !warmup` sets with positive weight and reps count. Sorted by 1RM desc.
 */
export function personalRecords(
  sessions: Pick<WorkoutSession, 'startedAt' | 'exercises'>[],
): PersonalRecord[] {
  const map = new Map<string, PersonalRecord>()
  for (const session of sessions) {
    const date = sessionDate(session)
    for (const ex of session.exercises) {
      for (const s of ex.sets) {
        if (!s.done || s.warmup || !s.weightKg || !s.reps || s.weightKg <= 0 || s.reps <= 0) continue
        const orm = epley1RM(s.weightKg, s.reps)
        const pr = map.get(ex.exerciseId)
        if (!pr) {
          map.set(ex.exerciseId, {
            exerciseId: ex.exerciseId,
            name: ex.name,
            maxWeightKg: s.weightKg,
            maxWeightReps: s.reps,
            maxWeightDate: date,
            best1RM: orm,
            best1RMDate: date,
          })
          continue
        }
        if (s.weightKg > pr.maxWeightKg || (s.weightKg === pr.maxWeightKg && s.reps > pr.maxWeightReps)) {
          pr.maxWeightKg = s.weightKg
          pr.maxWeightReps = s.reps
          pr.maxWeightDate = date
        }
        if (orm > pr.best1RM) {
          pr.best1RM = orm
          pr.best1RMDate = date
        }
      }
    }
  }
  return [...map.values()]
    .map((p) => ({ ...p, best1RM: round1(p.best1RM) }))
    .sort((a, b) => b.best1RM - a.best1RM || a.name.localeCompare(b.name))
}

/* ---------------------------- Streak ------------------------------ */

/** Days with any training: a gym session (with at least one done set, or finished) or any activity. */
export function activeDates(
  sessions: Pick<WorkoutSession, 'startedAt' | 'finishedAt' | 'exercises'>[],
  activities: Pick<Activity, 'date'>[],
): Set<string> {
  const set = new Set<string>()
  for (const s of sessions) {
    const anyDone = s.exercises.some((e) => e.sets.some((x) => x.done))
    if (s.finishedAt || anyDone) set.add(sessionDate(s))
  }
  for (const a of activities) set.add(a.date)
  return set
}

/**
 * Consecutive active days ending today. If today has no activity yet the streak is still alive
 * and is counted up to yesterday.
 */
export function currentStreak(dates: Set<string>, todayISO: string): number {
  let d = fromISODate(todayISO)
  if (!dates.has(todayISO)) d = addDays(d, -1)
  let n = 0
  while (dates.has(toISODate(d))) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export function longestStreak(dates: Set<string>): number {
  const sorted = [...dates].sort()
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const d of sorted) {
    run = prev && differenceInCalendarDays(fromISODate(d), fromISODate(prev)) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return best
}

export interface CalendarCell {
  date: string
  active: boolean
  future: boolean
}

/** `weeks` rows (oldest first) × 7 Monday-based days, the last row being the current week. */
export function calendarGrid(dates: Set<string>, weeks = 8, now: Date = new Date()): CalendarCell[][] {
  const todayISO = toISODate(now)
  const firstMonday = addDays(startOfWeek(now, { weekStartsOn: 1 }), -(weeks - 1) * 7)
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = toISODate(addDays(firstMonday, w * 7 + d))
      return { date, active: dates.has(date), future: date > todayISO }
    }),
  )
}

/* -------------------------- Measurements -------------------------- */

export type MeasurementField = Exclude<keyof Measurement, 'id' | 'date'>

export const MEASUREMENT_FIELDS: { key: MeasurementField; label: string }[] = [
  { key: 'neckCm', label: 'Шея' },
  { key: 'shouldersCm', label: 'Плечи' },
  { key: 'chestCm', label: 'Грудь' },
  { key: 'waistCm', label: 'Талия' },
  { key: 'hipsCm', label: 'Бёдра (таз)' },
  { key: 'armCm', label: 'Бицепс' },
  { key: 'forearmCm', label: 'Предплечье' },
  { key: 'thighCm', label: 'Бедро' },
  { key: 'calfCm', label: 'Икра' },
]

/** Per-field difference to the previous record; undefined when either value is missing. */
export function measurementDelta(
  current: Measurement,
  previous: Measurement | undefined,
): Partial<Record<MeasurementField, number>> {
  const out: Partial<Record<MeasurementField, number>> = {}
  if (!previous) return out
  for (const { key } of MEASUREMENT_FIELDS) {
    const a = current[key]
    const b = previous[key]
    if (a != null && b != null) out[key] = round1(a - b)
  }
  return out
}
