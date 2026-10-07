import type {
  Activity,
  Habit,
  HabitAutoRule,
  HabitLog,
  ISODate,
  ReadingLog,
  SleepEntry,
  WaterEntry,
  WorkoutSession,
} from '../../../db/types'
import { fromISODate, toISODate, weekDates } from '../../../lib/dates'
import { dateRange, shiftDate } from '../shared'

/* ------------------------------ auto rules ------------------------------ */

export const DEFAULT_WATER_TARGET_ML = 3000
/** Latest bedtime (local, minutes since midnight) that still counts for the sleep rule: 23:30. */
export const SLEEP_DEADLINE_MIN = 23 * 60 + 30

/** Data from other features used to auto-complete habits. */
export interface AutoData {
  sessions: Pick<WorkoutSession, 'finishedAt'>[]
  activities: Pick<Activity, 'date' | 'type'>[]
  water: Pick<WaterEntry, 'date' | 'ml'>[]
  sleep: Pick<SleepEntry, 'date' | 'bedtime'>[]
  readingLogs: Pick<ReadingLog, 'date' | 'pages' | 'minutes'>[]
  waterTargetMl?: number
}

export type AutoRuleKey = Exclude<HabitAutoRule, null>
export type AutoIndex = Record<AutoRuleKey, Set<ISODate>>

export const AUTO_RULES: AutoRuleKey[] = ['workout', 'cardio', 'water', 'sleep', 'reading', 'stretch']

export const AUTO_RULE_RU: Record<AutoRuleKey, string> = {
  workout: 'Тренировка в зале завершена',
  cardio: 'Есть кардио-активность',
  water: 'Выпита норма воды',
  sleep: 'Отбой до 23:30',
  reading: 'Чтение ≥ 20 мин или ≥ 10 стр.',
  stretch: 'Была растяжка',
}

/** True when a bedtime timestamp is at or before 23:30 local time (the evening before waking). */
export function isEarlyBedtime(bedtime: string): boolean {
  const d = new Date(bedtime)
  if (Number.isNaN(d.getTime())) return false
  const h = d.getHours()
  // After midnight (00:00–11:59) means a late night.
  if (h < 12) return false
  return h * 60 + d.getMinutes() <= SLEEP_DEADLINE_MIN
}

/** For every auto rule, the set of dates on which it is satisfied. */
export function buildAutoIndex(data: AutoData): AutoIndex {
  const idx: AutoIndex = {
    workout: new Set(),
    cardio: new Set(),
    water: new Set(),
    sleep: new Set(),
    reading: new Set(),
    stretch: new Set(),
  }
  for (const s of data.sessions) {
    if (s.finishedAt) idx.workout.add(toISODate(new Date(s.finishedAt)))
  }
  for (const a of data.activities) {
    if (a.type === 'stretch') idx.stretch.add(a.date)
    else idx.cardio.add(a.date)
  }
  const target = data.waterTargetMl || DEFAULT_WATER_TARGET_ML
  const waterByDay = new Map<string, number>()
  for (const w of data.water) waterByDay.set(w.date, (waterByDay.get(w.date) ?? 0) + w.ml)
  for (const [date, ml] of waterByDay) if (ml >= target) idx.water.add(date)
  for (const s of data.sleep) if (isEarlyBedtime(s.bedtime)) idx.sleep.add(s.date)
  for (const r of data.readingLogs) {
    if ((r.minutes ?? 0) >= 20 || r.pages >= 10) idx.reading.add(r.date)
  }
  return idx
}

/** Whether the habit's auto rule is satisfied on `date` according to other app data. */
export function isAutoDone(rule: HabitAutoRule, date: ISODate, data: AutoData): boolean {
  if (!rule) return false
  return buildAutoIndex(data)[rule].has(date)
}

/* ------------------------------ done sets ------------------------------- */

export interface HabitStatus {
  /** Effective completion dates (manual logs override auto). */
  done: Set<ISODate>
  /** Dates completed only by the auto rule (no manual log). */
  auto: Set<ISODate>
  /** Manual logs by date. */
  manual: Map<ISODate, boolean>
}

/** Merge manual logs with auto completions: a manual log for a day always wins. */
export function habitStatus(habit: Pick<Habit, 'id' | 'autoRule'>, logs: HabitLog[], auto: AutoIndex): HabitStatus {
  const manual = new Map<ISODate, boolean>()
  for (const l of logs) if (l.habitId === habit.id) manual.set(l.date, l.done)
  const done = new Set<ISODate>()
  const autoOnly = new Set<ISODate>()
  if (habit.autoRule) {
    for (const d of auto[habit.autoRule]) {
      if (!manual.has(d)) {
        done.add(d)
        autoOnly.add(d)
      }
    }
  }
  for (const [d, v] of manual) if (v) done.add(d)
  return { done, auto: autoOnly, manual }
}

/** Stable habit-log id so a day has at most one log per habit. */
export function habitLogId(habitId: string, date: ISODate): string {
  return `${habitId}@${date}`
}

/* ------------------------------- streaks -------------------------------- */

const MAX_LOOKBACK_DAYS = 3660

/**
 * Consecutive done days ending today. If today is not marked yet the streak is
 * counted from yesterday — the day is not over, so the streak is not broken.
 */
export function dailyStreak(done: Set<ISODate>, todayDate: ISODate): number {
  return streakBy((d) => done.has(d), todayDate)
}

/** Generic daily streak over a predicate (used for "all daily habits done"). */
export function streakBy(isDone: (d: ISODate) => boolean, todayDate: ISODate): number {
  let d = isDone(todayDate) ? todayDate : shiftDate(todayDate, -1)
  let n = 0
  while (n < MAX_LOOKBACK_DAYS && isDone(d)) {
    n++
    d = shiftDate(d, -1)
  }
  return n
}

/** Monday of the week containing `date`. */
export function weekStart(date: ISODate): ISODate {
  return weekDates(fromISODate(date))[0]
}

/** Number of done days in the Monday-based week containing `date`. */
export function weekCount(done: Set<ISODate>, date: ISODate): number {
  return weekDates(fromISODate(date)).filter((d) => done.has(d)).length
}

/** Weekly habit success: at least `target` done days in the week containing `date`. */
export function isWeekSuccess(done: Set<ISODate>, date: ISODate, target: number): boolean {
  return weekCount(done, date) >= Math.max(1, target)
}

/**
 * Consecutive successful weeks ending with the current one. The current week
 * counts only once it is successful; until then the streak starts from last week.
 */
export function weeklyStreak(done: Set<ISODate>, todayDate: ISODate, target: number): number {
  let w = weekStart(todayDate)
  if (!isWeekSuccess(done, w, target)) w = shiftDate(w, -7)
  let n = 0
  while (n < MAX_LOOKBACK_DAYS / 7 && isWeekSuccess(done, w, target)) {
    n++
    w = shiftDate(w, -7)
  }
  return n
}

export function targetOf(habit: Pick<Habit, 'targetPerWeek'>): number {
  return Math.min(7, Math.max(1, habit.targetPerWeek ?? 3))
}

/** Current streak in days (daily) or weeks (weekly). */
export function habitStreak(
  habit: Pick<Habit, 'frequency' | 'targetPerWeek'>,
  done: Set<ISODate>,
  todayDate: ISODate,
): number {
  return habit.frequency === 'weekly'
    ? weeklyStreak(done, todayDate, targetOf(habit))
    : dailyStreak(done, todayDate)
}

/** Longest streak between `from` and `to` (days for daily, weeks for weekly habits). */
export function bestStreak(
  habit: Pick<Habit, 'frequency' | 'targetPerWeek'>,
  done: Set<ISODate>,
  from: ISODate,
  to: ISODate,
): number {
  let best = 0
  let run = 0
  if (habit.frequency === 'weekly') {
    const target = targetOf(habit)
    for (let w = weekStart(from); w <= to; w = shiftDate(w, 7)) {
      // The running week is not a failure yet.
      const current = w === weekStart(to)
      if (isWeekSuccess(done, w, target)) run++
      else if (!current) run = 0
      best = Math.max(best, run)
    }
    return best
  }
  for (const d of dateRange(from, to)) {
    if (done.has(d)) run++
    else run = 0
    best = Math.max(best, run)
  }
  return best
}

/**
 * Completion over the last 30 days (0..1). Daily: done days / days in window.
 * Weekly: done days / expected days (target × days / 7), capped at 1.
 * `since` (e.g. habit creation date) shortens the window for new habits.
 */
export function completionRate(
  habit: Pick<Habit, 'frequency' | 'targetPerWeek'>,
  done: Set<ISODate>,
  todayDate: ISODate,
  days = 30,
  since?: ISODate,
): number {
  let from = shiftDate(todayDate, -(days - 1))
  if (since && since > from) from = since > todayDate ? todayDate : since
  const range = dateRange(from, todayDate)
  const count = range.filter((d) => done.has(d)).length
  if (habit.frequency === 'weekly') {
    const expected = (targetOf(habit) * range.length) / 7
    return Math.min(1, count / expected)
  }
  return count / range.length
}

/** Streak of days on which every given daily habit was done (today not yet done does not break it). */
export function allDoneStreak(doneSets: Set<ISODate>[], todayDate: ISODate): number {
  if (doneSets.length === 0) return 0
  return streakBy((d) => doneSets.every((s) => s.has(d)), todayDate)
}

/** Active (non-archived) habits ordered by `sort`. */
export function activeHabits(habits: Habit[]): Habit[] {
  return habits.filter((h) => !h.archived).sort((a, b) => a.sort - b.sort)
}

export interface TodaySummary {
  habits: Habit[]
  done: number
  total: number
  /** Days in a row with every active daily habit done. */
  streak: number
}

/** Active habits with today's completion and the "all daily habits" streak. */
export function todaySummary(habits: Habit[], status: Map<string, HabitStatus>, todayDate: ISODate): TodaySummary {
  const active = activeHabits(habits)
  const done = active.filter((h) => status.get(h.id)?.done.has(todayDate)).length
  const daily = active.filter((h) => h.frequency === 'daily').map((h) => status.get(h.id)?.done ?? new Set<ISODate>())
  return { habits: active, done, total: active.length, streak: allDoneStreak(daily, todayDate) }
}
