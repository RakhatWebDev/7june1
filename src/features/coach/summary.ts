import type { FormaDB } from '../../db'
import type { Habit, HabitAutoRule, ISODate, Profile, Program, ProgramDay } from '../../db/types'
import { toISODate, weekdayIndex } from '../../lib/dates'
import { computeTargets, type Targets } from '../nutrition/calc'
import { localDay, shiftDate } from './util'

/* DB readers shared by tools, insights and UI. */

export const ACTIVE_PROGRAM_KEY = 'activeProgramId'
export const DEFAULT_WATER_TARGET_ML = 3000
export const DEFAULT_SLEEP_TARGET_MIN = 8 * 60

export interface ProfileSummary {
  profile: Profile | null
  targets: Targets | null
  currentWeightKg: number | null
  activeProgram: Program | null
  /** Program day scheduled for today's weekday (may be a rest day), if any */
  todayDay: ProgramDay | null
}

/** Active program: `settings.activeProgramId`, else the first built-in, else the first program. */
export async function getActiveProgram(db: FormaDB): Promise<Program | null> {
  const [setting, programs] = await Promise.all([db.settings.get(ACTIVE_PROGRAM_KEY), db.programs.toArray()])
  const activeId = typeof setting?.value === 'string' ? setting.value : null
  return programs.find((p) => p.id === activeId) ?? programs.find((p) => p.isBuiltIn) ?? programs[0] ?? null
}

/** Latest weigh-in on or before `date`, else null. */
export async function latestWeightKg(db: FormaDB, date?: ISODate): Promise<number | null> {
  const coll = date ? db.weights.where('date').belowOrEqual(date) : db.weights.orderBy('date')
  const last = await coll.last()
  return last?.weightKg ?? null
}

/** Profile, nutrition targets at the current bodyweight, active program and today's program day. */
export async function summarizeProfile(db: FormaDB, now: Date = new Date()): Promise<ProfileSummary> {
  const today = toISODate(now)
  const [profile, weight, activeProgram] = await Promise.all([
    db.profile.get(1),
    latestWeightKg(db, today),
    getActiveProgram(db),
  ])
  const currentWeightKg = weight ?? profile?.weightKg ?? null
  const targets = profile && currentWeightKg ? computeTargets(profile, currentWeightKg, now) : null
  const todayDay = activeProgram?.days.find((d) => d.weekday === weekdayIndex(now)) ?? null
  return { profile: profile ?? null, targets, currentWeightKg, activeProgram, todayDay }
}

/** Next startable day of the program after today (by weekday), with how many days ahead it is. */
export function nextTrainingDay(
  program: Program | null,
  now: Date,
  includeToday = false,
): { day: ProgramDay; inDays: number } | null {
  if (!program) return null
  const wd = weekdayIndex(now)
  for (let i = includeToday ? 0 : 1; i <= 7; i++) {
    const day = program.days.find((d) => d.weekday === (wd + i) % 7)
    if (day && day.type !== 'rest' && day.exercises.length > 0) return { day, inDays: i }
  }
  return null
}

/* ------------------------------- habits ------------------------------- */

export interface HabitDoneIndex {
  habits: Habit[]
  /** habitId → dates on which it is done (manual logs override auto rules) */
  done: Map<string, Set<ISODate>>
}

/** Active habits with done-days in [from, to], merging manual logs with auto rules. */
export async function habitDoneIndex(db: FormaDB, from: ISODate, to: ISODate): Promise<HabitDoneIndex> {
  const [allHabits, logs, sessions, activities, water, sleep, reading, profile] = await Promise.all([
    db.habits.toArray(),
    db.habitLogs.where('date').between(from, to, true, true).toArray(),
    db.sessions.where('startedAt').aboveOrEqual(shiftDate(from, -1)).toArray(),
    db.activities.where('date').between(from, to, true, true).toArray(),
    db.water.where('date').between(from, to, true, true).toArray(),
    db.sleep.where('date').between(from, to, true, true).toArray(),
    db.readingLogs.where('date').between(from, to, true, true).toArray(),
    db.profile.get(1),
  ])
  const waterTarget = profile?.waterTargetMl || DEFAULT_WATER_TARGET_ML
  const waterByDay = new Map<string, number>()
  for (const w of water) waterByDay.set(w.date, (waterByDay.get(w.date) ?? 0) + (w.ml || 0))
  const auto: Record<Exclude<HabitAutoRule, null>, Set<string>> = {
    workout: new Set(sessions.filter((s) => s.finishedAt).map((s) => localDay(s.finishedAt))),
    cardio: new Set(activities.filter((a) => a.type !== 'stretch').map((a) => a.date)),
    stretch: new Set(activities.filter((a) => a.type === 'stretch').map((a) => a.date)),
    water: new Set([...waterByDay].filter(([, ml]) => ml >= waterTarget).map(([d]) => d)),
    sleep: new Set(
      sleep
        .filter((s) => {
          const d = new Date(s.bedtime)
          return !Number.isNaN(d.getTime()) && d.getHours() >= 12 && d.getHours() * 60 + d.getMinutes() <= 23 * 60 + 30
        })
        .map((s) => s.date),
    ),
    reading: new Set(reading.filter((r) => (r.minutes ?? 0) >= 20 || r.pages >= 10).map((r) => r.date)),
  }
  const habits = allHabits.filter((h) => !h.archived).sort((a, b) => a.sort - b.sort)
  const done = new Map<string, Set<ISODate>>()
  for (const h of habits) {
    const manual = new Map<string, boolean>()
    for (const l of logs) if (l.habitId === h.id) manual.set(l.date, l.done)
    const set = new Set<ISODate>()
    if (h.autoRule) for (const d of auto[h.autoRule]) if (manual.get(d) !== false) set.add(d)
    for (const [d, ok] of manual) if (ok) set.add(d)
    done.set(h.id, set)
  }
  return { habits, done }
}

/** Consecutive done days ending at `today` (or yesterday if today is not done yet). */
export function dailyStreak(done: Set<ISODate>, today: ISODate): number {
  let d = done.has(today) ? today : shiftDate(today, -1)
  let n = 0
  while (done.has(d)) {
    n++
    d = shiftDate(d, -1)
  }
  return n
}
