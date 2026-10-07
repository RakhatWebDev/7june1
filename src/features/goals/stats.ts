import type { FormaDB } from '../../db'
import type { HabitAutoRule, ISODate } from '../../db/types'
import { fromISODate, toISODate, weekDates } from '../../lib/dates'
import { computeTargets } from '../nutrition/calc'

/** Default daily water target when the profile has none (matches the habits feature). */
const DEFAULT_WATER_TARGET_ML = 3000
/** Latest bedtime that counts for the "sleep" habit auto rule: 23:30 local. */
const SLEEP_DEADLINE_MIN = 23 * 60 + 30

const round = (n: number, digits = 0) => {
  const k = 10 ** digits
  return Math.round(Number((n * k).toPrecision(12))) / k
}
const sum = (xs: number[]) => xs.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0)

/** Local calendar day of an ISO timestamp (date-only strings are taken as-is). */
function localDay(ts: string): ISODate {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : toISODate(d)
}

function isEarlyBedtime(bedtime: string): boolean {
  const d = new Date(bedtime)
  if (Number.isNaN(d.getTime())) return false
  const h = d.getHours()
  if (h < 12) return false // after midnight = a late night
  return h * 60 + d.getMinutes() <= SLEEP_DEADLINE_MIN
}

/**
 * Snapshot of everything that happened in the Monday-based week containing
 * `weekStart`, read from every table of `database`. Missing data yields 0.
 *
 * Keys: workouts, workoutVolumeKg, cardioMin, cardioKm, stretchMin, avgSleepMin,
 * sleepNights, avgKcal, kcalTarget, daysOnKcal, waterAvgMl, habitsPct, pagesRead,
 * readingMin, moodAvg, mindMin, gratitudeDays, spent, income, budgetPct,
 * weightStart, weightEnd, calendarEvents.
 *
 * Averages over days (kcal, water) only count days that have records.
 */
export async function collectWeekStats(
  database: FormaDB,
  weekStart: ISODate,
): Promise<Record<string, number>> {
  const dates = weekDates(fromISODate(weekStart))
  const start = dates[0]
  const end = dates[6]
  const inWeek = (d: string) => d >= start && d <= end

  const [
    profile,
    sessions,
    activities,
    foodEntries,
    water,
    weights,
    lastWeight,
    sleep,
    habits,
    habitLogs,
    readingLogs,
    moods,
    journal,
    mindSessions,
    transactions,
    budgets,
    calendarEvents,
  ] = await Promise.all([
    database.profile.get(1),
    database.sessions.toArray(),
    database.activities.where('date').between(start, end, true, true).toArray(),
    database.foodEntries.where('date').between(start, end, true, true).toArray(),
    database.water.where('date').between(start, end, true, true).toArray(),
    database.weights.where('date').between(start, end, true, true).sortBy('date'),
    database.weights.where('date').belowOrEqual(end).last(),
    database.sleep.where('date').between(start, end, true, true).toArray(),
    database.habits.toArray(),
    database.habitLogs.where('date').between(start, end, true, true).toArray(),
    database.readingLogs.where('date').between(start, end, true, true).toArray(),
    database.moods.where('date').between(start, end, true, true).toArray(),
    database.journal.where('date').between(start, end, true, true).toArray(),
    database.mindSessions.where('date').between(start, end, true, true).toArray(),
    database.transactions.where('date').between(start, end, true, true).toArray(),
    database.budgets.toArray(),
    database.calendarEvents.toArray(),
  ])

  /* --- training --- */
  const finished = sessions.filter((s) => s.finishedAt && inWeek(localDay(s.startedAt)))
  let volume = 0
  for (const s of finished) {
    for (const ex of s.exercises ?? []) {
      for (const set of ex.sets ?? []) {
        if (set.done && !set.warmup && set.weightKg != null && set.reps != null)
          volume += set.weightKg * set.reps
      }
    }
  }
  const cardio = activities.filter((a) => a.type !== 'stretch')
  const stretch = activities.filter((a) => a.type === 'stretch')

  /* --- sleep --- */
  const sleepMins = sleep.map((s) => s.durationMin).filter((m) => Number.isFinite(m) && m > 0)

  /* --- nutrition --- */
  const kcalByDay = new Map<string, number>()
  for (const e of foodEntries) kcalByDay.set(e.date, (kcalByDay.get(e.date) ?? 0) + (e.kcal || 0))
  const loggedKcal = [...kcalByDay.values()].filter((k) => k > 0)
  const kcalTarget = profile
    ? computeTargets(profile, lastWeight?.weightKg ?? profile.weightKg, fromISODate(end)).kcal
    : 0
  const daysOnKcal =
    kcalTarget > 0
      ? loggedKcal.filter((k) => Math.abs(k - kcalTarget) <= kcalTarget * 0.1).length
      : 0

  const waterByDay = new Map<string, number>()
  for (const w of water) waterByDay.set(w.date, (waterByDay.get(w.date) ?? 0) + (w.ml || 0))
  const waterDays = [...waterByDay.values()].filter((ml) => ml > 0)

  /* --- habits (manual logs merged with auto rules, like the habits tracker) --- */
  const waterTarget = profile?.waterTargetMl || DEFAULT_WATER_TARGET_ML
  const auto: Record<Exclude<HabitAutoRule, null>, Set<string>> = {
    workout: new Set(finished.map((s) => localDay(s.finishedAt as string))),
    cardio: new Set(cardio.map((a) => a.date)),
    stretch: new Set(stretch.map((a) => a.date)),
    water: new Set([...waterByDay].filter(([, ml]) => ml >= waterTarget).map(([d]) => d)),
    sleep: new Set(sleep.filter((s) => isEarlyBedtime(s.bedtime)).map((s) => s.date)),
    reading: new Set(
      readingLogs.filter((r) => (r.minutes ?? 0) >= 20 || r.pages >= 10).map((r) => r.date),
    ),
  }
  const scores: number[] = []
  for (const h of habits) {
    if (h.archived) continue
    const created = h.createdAt ? localDay(h.createdAt) : start
    if (created > end) continue
    const manual = new Map<string, boolean>()
    for (const l of habitLogs) if (l.habitId === h.id) manual.set(l.date, l.done)
    const isDone = (d: string) =>
      manual.has(d) ? manual.get(d) === true : !!h.autoRule && auto[h.autoRule].has(d)
    if (h.frequency === 'weekly') {
      const target = Math.min(7, Math.max(1, h.targetPerWeek ?? 3))
      scores.push(Math.min(target, dates.filter(isDone).length) / target)
    } else {
      const eligible = dates.filter((d) => d >= created)
      if (eligible.length > 0) scores.push(eligible.filter(isDone).length / eligible.length)
    }
  }

  /* --- mind --- */
  const moodValues = moods.map((m) => m.mood).filter((m) => Number.isFinite(m))
  const gratitudeDays = new Set(journal.filter((j) => j.kind === 'gratitude').map((j) => j.date))
    .size

  /* --- finance --- */
  const expenses = transactions.filter((t) => t.kind === 'expense')
  const spent = sum(expenses.map((t) => t.amount))
  const income = sum(transactions.filter((t) => t.kind === 'income').map((t) => t.amount))
  // Budgets are monthly: compare spending in budgeted categories with their weekly share (12 months / 52 weeks).
  const budgeted = new Set(budgets.map((b) => b.categoryId))
  const weeklyBudget = (sum(budgets.map((b) => b.monthlyLimit)) * 12) / 52
  const budgetSpent = sum(expenses.filter((t) => budgeted.has(t.categoryId)).map((t) => t.amount))

  return {
    workouts: finished.length,
    workoutVolumeKg: round(volume),
    cardioMin: round(sum(cardio.map((a) => a.durationMin))),
    cardioKm: round(sum(cardio.map((a) => a.distanceKm ?? 0)), 1),
    stretchMin: round(sum(stretch.map((a) => a.durationMin))),
    avgSleepMin: sleepMins.length ? round(sum(sleepMins) / sleepMins.length) : 0,
    sleepNights: sleepMins.length,
    avgKcal: loggedKcal.length ? round(sum(loggedKcal) / loggedKcal.length) : 0,
    kcalTarget,
    daysOnKcal,
    waterAvgMl: waterDays.length ? round(sum(waterDays) / waterDays.length) : 0,
    habitsPct: scores.length ? round((sum(scores) / scores.length) * 100) : 0,
    pagesRead: round(sum(readingLogs.map((r) => r.pages))),
    readingMin: round(sum(readingLogs.map((r) => r.minutes ?? 0))),
    moodAvg: moodValues.length ? round(sum(moodValues) / moodValues.length, 1) : 0,
    mindMin: round(sum(mindSessions.map((m) => m.durationMin))),
    gratitudeDays,
    spent: round(spent, 2),
    income: round(income, 2),
    budgetPct: weeklyBudget > 0 ? round((budgetSpent / weeklyBudget) * 100) : 0,
    weightStart: weights[0]?.weightKg ?? 0,
    weightEnd: weights.at(-1)?.weightKg ?? 0,
    calendarEvents: calendarEvents.filter((e) => inWeek(localDay(e.startAt))).length,
  }
}
