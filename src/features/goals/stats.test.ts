import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FormaDB } from '../../db'
import type { SetLog, WorkoutSession } from '../../db/types'
import { METRIC_KEYS } from './metrics'
import { collectWeekStats } from './stats'

/** Local-time ISO timestamp for a calendar day. */
const at = (date: string, hour = 12, min = 0) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, hour, min).toISOString()
}

const set = (weightKg: number, reps: number, done = true, warmup = false): SetLog => ({ weightKg, reps, done, warmup })

const session = (id: string, date: string, sets: SetLog[], finished = true): WorkoutSession => ({
  id,
  name: 'Тренировка',
  startedAt: at(date, 18),
  finishedAt: finished ? at(date, 19) : undefined,
  exercises: [{ exerciseId: 'Barbell_Squat', name: 'Присед', targetSets: sets.length, targetReps: '5', sets }],
})

const WEEK = '2026-09-28' // Monday; the week runs to 2026-10-04
const createdAt = '2026-01-01T00:00:00.000Z'

let database: FormaDB

async function fill(d: FormaDB) {
  await d.profile.put({
    id: 1,
    name: 'Тест',
    sex: 'male',
    birthYear: 1996,
    heightCm: 180,
    weightKg: 90,
    activityLevel: 'moderate',
    goal: 'cut',
    kcalTargetOverride: 2500,
    waterTargetMl: 3000,
    updatedAt: createdAt,
  })
  await d.sessions.bulkPut([
    // 100×5 counts; warm-up and undone sets do not → 500
    session('s1', '2026-09-29', [set(100, 5), set(60, 10, true, true), set(80, 8, false)]),
    session('s2', '2026-10-01', [set(50, 10), set(50, 10)]), // 1000
    session('s3', '2026-10-02', [set(200, 5)], false), // unfinished → ignored
    session('s4', '2026-09-27', [set(200, 5)]), // previous week → ignored
  ])
  await d.activities.bulkPut([
    { id: 'a1', type: 'run', date: '2026-09-30', durationMin: 30, distanceKm: 5 },
    { id: 'a2', type: 'bike', date: '2026-10-02', durationMin: 45, distanceKm: 15.5 },
    { id: 'a3', type: 'stretch', date: '2026-10-03', durationMin: 20 },
    { id: 'a4', type: 'run', date: '2026-09-27', durationMin: 60, distanceKm: 10 },
  ])
  await d.sleep.bulkPut([
    { id: 'sl1', date: '2026-09-29', bedtime: at('2026-09-28', 23), wakeTime: at('2026-09-29', 6), durationMin: 420, quality: 3 },
    { id: 'sl2', date: '2026-09-30', bedtime: at('2026-09-29', 22), wakeTime: at('2026-09-30', 6), durationMin: 480, quality: 4 },
    { id: 'sl3', date: '2026-10-01', bedtime: at('2026-09-30', 23, 45), wakeTime: at('2026-10-01', 7), durationMin: 450, quality: 4 },
  ])
  const food = (id: string, date: string, kcal: number) => ({
    id,
    date,
    meal: 'lunch' as const,
    name: 'Еда',
    grams: 100,
    kcal,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    createdAt,
  })
  await d.foodEntries.bulkPut([
    food('f1', '2026-09-28', 1200),
    food('f2', '2026-09-28', 1200), // 2400 — within ±10% of 2500
    food('f3', '2026-09-29', 3000), // outside
    food('f4', '2026-09-30', 2600), // within
    food('f5', '2026-10-05', 5000), // next week
  ])
  await d.water.bulkPut([
    { id: 'w1', date: '2026-09-28', ml: 2000, createdAt },
    { id: 'w2', date: '2026-09-28', ml: 1000, createdAt },
    { id: 'w3', date: '2026-09-29', ml: 2000, createdAt },
  ])
  await d.weights.bulkPut([
    { id: 'wt0', date: '2026-09-21', weightKg: 89 },
    { id: 'wt1', date: '2026-09-28', weightKg: 88.4 },
    { id: 'wt2', date: '2026-10-04', weightKg: 87.6 },
  ])
  await d.habits.bulkPut([
    { id: 'h1', name: 'Без сахара', icon: '🍬', color: 'danger', frequency: 'daily', autoRule: null, sort: 0, archived: false, createdAt },
    { id: 'h2', name: 'Кардио', icon: '🏃', color: 'info', frequency: 'weekly', targetPerWeek: 3, autoRule: 'cardio', sort: 1, archived: false, createdAt },
    { id: 'h3', name: 'Старое', icon: '•', color: 'info', frequency: 'daily', autoRule: null, sort: 2, archived: true, createdAt },
  ])
  // h1: 5 of 7 days; h2: auto from cardio on 2 days → 2 of 3
  await d.habitLogs.bulkPut(
    ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((date) => ({
      id: `h1@${date}`,
      habitId: 'h1',
      date,
      done: true,
    })),
  )
  await d.readingLogs.bulkPut([
    { id: 'r1', bookId: 'b1', date: '2026-09-29', pages: 20, minutes: 30, createdAt },
    { id: 'r2', bookId: 'b1', date: '2026-10-03', pages: 15, createdAt },
  ])
  await d.moods.bulkPut([
    { id: 'm1', date: '2026-09-28', slot: 'morning', mood: 4, createdAt },
    { id: 'm2', date: '2026-09-28', slot: 'evening', mood: 5, createdAt },
    { id: 'm3', date: '2026-10-01', slot: 'morning', mood: 3, createdAt },
  ])
  await d.mindSessions.bulkPut([
    { id: 'ms1', date: '2026-09-29', kind: 'meditation', durationMin: 10, createdAt },
    { id: 'ms2', date: '2026-10-02', kind: 'breathing', durationMin: 15, createdAt },
  ])
  await d.journal.bulkPut([
    { id: 'j1', date: '2026-09-28', kind: 'gratitude', items: ['a'], createdAt },
    { id: 'j2', date: '2026-09-28', kind: 'gratitude', items: ['b'], createdAt },
    { id: 'j3', date: '2026-09-30', kind: 'gratitude', items: ['c'], createdAt },
    { id: 'j4', date: '2026-10-01', kind: 'reflection', text: 'x', createdAt },
  ])
  await d.transactions.bulkPut([
    { id: 't1', kind: 'expense', amount: 5000, categoryId: 'cat-food', date: '2026-09-29', createdAt },
    { id: 't2', kind: 'expense', amount: 3000, categoryId: 'cat-transport', date: '2026-10-01', createdAt },
    { id: 't3', kind: 'income', amount: 100000, categoryId: 'cat-salary', date: '2026-10-02', createdAt },
    { id: 't4', kind: 'expense', amount: 9999, categoryId: 'cat-food', date: '2026-09-27', createdAt },
  ])
  // 52 000 / month → 12 000 / week; 5 000 spent in the budgeted category → 42 %
  await d.budgets.put({ id: 'bud1', categoryId: 'cat-food', monthlyLimit: 52000 })
  const ev = (id: string, date: string) => ({
    id,
    title: 'OneFit',
    startAt: at(date, 9),
    endAt: at(date, 10),
    allDay: false,
    source: 'test.ics',
    kind: 'gym' as const,
    importedAt: createdAt,
  })
  await d.calendarEvents.bulkPut([ev('e1', '2026-09-28'), ev('e2', '2026-10-04'), ev('e3', '2026-10-05')])
}

describe('collectWeekStats', () => {
  beforeEach(() => {
    database = new FormaDB(`test-goals-stats-${Math.random().toString(36).slice(2)}`)
  })
  afterEach(async () => {
    await database.delete()
  })

  it('collects every metric from a filled database', async () => {
    await fill(database)
    const s = await collectWeekStats(database, WEEK)
    expect(s).toEqual({
      workouts: 2,
      workoutVolumeKg: 1500,
      cardioMin: 75,
      cardioKm: 20.5,
      stretchMin: 20,
      avgSleepMin: 450,
      sleepNights: 3,
      avgKcal: 2667,
      kcalTarget: 2500,
      daysOnKcal: 2,
      waterAvgMl: 2500,
      habitsPct: 69,
      pagesRead: 35,
      readingMin: 30,
      moodAvg: 4,
      mindMin: 25,
      gratitudeDays: 2,
      spent: 8000,
      income: 100000,
      budgetPct: 42,
      weightStart: 88.4,
      weightEnd: 87.6,
      calendarEvents: 2,
    })
  })

  it('accepts any day of the week as the week start', async () => {
    await fill(database)
    const s = await collectWeekStats(database, '2026-10-01')
    expect(s.workouts).toBe(2)
    expect(s.spent).toBe(8000)
  })

  it('uses computeTargets with the latest bodyweight when there is no override', async () => {
    await fill(database)
    await database.profile.update(1, { kcalTargetOverride: undefined })
    const s = await collectWeekStats(database, WEEK)
    // latest weight 87.6 kg, 180 cm, 30 y, male: BMR 1856, ×1.55 = 2876.8, cut −18 % → 2359
    expect(s.kcalTarget).toBe(2359)
  })

  it('returns zeros for every metric on an empty database', async () => {
    const s = await collectWeekStats(database, WEEK)
    expect(Object.keys(s).sort()).toEqual([...METRIC_KEYS].sort())
    expect(Object.values(s).every((v) => v === 0)).toBe(true)
  })
})
