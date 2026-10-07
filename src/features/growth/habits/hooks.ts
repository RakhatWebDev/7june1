import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../db'
import type { Habit, HabitLog, ISODate } from '../../../db/types'
import { shiftDate } from '../shared'
import { today } from '../../../lib/dates'
import { buildAutoIndex, habitStatus, todaySummary, type AutoIndex, type HabitStatus } from './calc'
import { ensureHabitsSeeded } from './seed'

/** Seeds the default habits on first open (idempotent). */
export function useEnsureHabitsSeeded(): void {
  useEffect(() => {
    ensureHabitsSeeded().catch(() => {
      /* seeding is best-effort */
    })
  }, [])
}

export interface HabitsData {
  habits: Habit[]
  logs: HabitLog[]
  auto: AutoIndex
  status: Map<string, HabitStatus>
}

/**
 * Live habits with their effective completion (manual logs + auto rules)
 * for dates from `from` (inclusive) onward.
 */
export function useHabitsData(from: ISODate): HabitsData | undefined {
  return useLiveQuery(async () => {
    // Sessions are indexed by `startedAt` (ISO timestamp); a margin covers time-zone shifts.
    const sessionFrom = shiftDate(from, -2)
    const [habits, logs, sessions, activities, water, sleep, readingLogs, profile] = await Promise.all([
      db.habits.toArray(),
      db.habitLogs.where('date').aboveOrEqual(from).toArray(),
      db.sessions.where('startedAt').aboveOrEqual(sessionFrom).toArray(),
      db.activities.where('date').aboveOrEqual(from).toArray(),
      db.water.where('date').aboveOrEqual(from).toArray(),
      db.sleep.where('date').aboveOrEqual(from).toArray(),
      db.readingLogs.where('date').aboveOrEqual(from).toArray(),
      db.profile.get(1),
    ])
    const auto = buildAutoIndex({
      sessions,
      activities,
      water,
      sleep,
      readingLogs,
      waterTargetMl: profile?.waterTargetMl,
    })
    const status = new Map<string, HabitStatus>()
    for (const h of habits) status.set(h.id, habitStatus(h, logs, auto))
    return { habits, logs, auto, status }
  }, [from])
}

export const SUMMARY_HISTORY_DAYS = 365

/** Seeds habits and returns today's summary plus per-habit status. */
export function useHabitsToday() {
  useEnsureHabitsSeeded()
  const todayDate = today()
  const data = useHabitsData(shiftDate(todayDate, -SUMMARY_HISTORY_DAYS))
  if (!data) return undefined
  return { ...todaySummary(data.habits, data.status, todayDate), status: data.status, today: todayDate }
}
