import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FormaDB } from '../../db'
import { COACH_TOOLS, getCoachTool, NEXT_NOTES_KEY } from './tools'
import { summarizeProfile } from './summary'
import { at, freshDb, localDate, profile, program, session, set } from './testUtils'

const NOW = localDate('2026-10-07', 10) // Wednesday
let db: FormaDB

const run = (name: string, input: Record<string, unknown> = {}) => {
  const tool = getCoachTool(name)
  if (!tool) throw new Error(`missing tool ${name}`)
  return tool.run(input, db) as Promise<Record<string, unknown>>
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterAll(() => vi.useRealTimers())

beforeEach(async () => {
  db = freshDb()
  await db.profile.put(profile())
  await db.programs.put(program())
  await db.settings.put({ key: 'activeProgramId', value: 'p1' })
})
afterEach(async () => {
  db.close()
  await db.delete()
})

describe('registry', () => {
  it('exposes every contract tool with a schema and a description', () => {
    const names = COACH_TOOLS.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'get_profile_and_targets',
        'get_todays_plan',
        'get_recent_workouts',
        'get_exercise_history',
        'get_nutrition_summary',
        'get_sleep_summary',
        'get_weight_trend',
        'get_activities',
        'get_habits_status',
        'get_mood_and_mind',
        'get_week_stats',
        'get_upcoming_events',
        'log_food_entry',
        'log_weight',
        'log_activity',
        'add_note_to_next_session',
        'save_program',
      ]),
    )
    expect(new Set(names).size).toBe(names.length)
    for (const t of COACH_TOOLS) {
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.inputSchema.type).toBe('object')
      expect(t.mutates === true).toBe(t.name.startsWith('log_') || t.name === 'add_note_to_next_session' || t.name === 'save_program')
    }
    expect(getCoachTool('nope')).toBeUndefined()
  })
})

describe('read tools', () => {
  it('summarizeProfile uses the latest weigh-in and today\'s program day', async () => {
    await db.weights.bulkPut([
      { id: 'w1', date: '2026-10-01', weightKg: 84 },
      { id: 'w2', date: '2026-10-06', weightKg: 83.5 },
    ])
    const s = await summarizeProfile(db, NOW)
    expect(s.currentWeightKg).toBe(83.5)
    expect(s.targets?.proteinG).toBe(167)
    expect(s.activeProgram?.id).toBe('p1')
    expect(s.todayDay?.id).toBe('push')
  })

  it('get_profile_and_targets', async () => {
    const r = await run('get_profile_and_targets')
    expect(r.date).toBe('2026-10-07')
    expect(r.profile).toMatchObject({ goal: 'cut', age: 30 })
    expect(r.currentWeightKg).toBe(85)
    expect((r.targets as { kcal: number }).kcal).toBeGreaterThan(1500)
    expect((r.todayDay as { name: string }).name).toBe('Жим')
  })

  it('get_todays_plan includes last performance and coach notes', async () => {
    await db.sessions.put(
      session('s1', '2026-10-05', [{ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', sets: [set(80, 8), set(80, 7)] }]),
    )
    await db.settings.put({ key: NEXT_NOTES_KEY, value: { 'Barbell_Bench_Press_-_Medium_Grip': { note: '82,5 кг', createdAt: '' } } })
    await db.foodEntries.put({ id: 'f', date: '2026-10-07', meal: 'breakfast', name: 'Овсянка', grams: 100, kcal: 350, proteinG: 12, carbsG: 60, fatG: 6, createdAt: at('2026-10-07', 8) })
    await db.water.put({ id: 'wa', date: '2026-10-07', ml: 500, createdAt: at('2026-10-07', 9) })
    const r = await run('get_todays_plan')
    const day = r.programDay as { exercises: { lastTime?: string; coachNote?: string }[] }
    expect(day.exercises[0].lastTime).toBe('2026-10-05: 80x8, 80x7')
    expect(day.exercises[0].coachNote).toBe('82,5 кг')
    expect(r.nutritionToday).toMatchObject({ kcal: 350, proteinG: 12 })
    expect(r.waterToday).toEqual({ ml: 500, targetMl: 3000 })
  })

  it('get_recent_workouts honours the window and skips warm-ups and unfinished sessions', async () => {
    await db.sessions.bulkPut([
      session('old', '2026-09-01', [{ exerciseId: 'Barbell_Squat', sets: [set(100, 5)] }]),
      session('s1', '2026-10-05', [{ exerciseId: 'Barbell_Squat', sets: [set(60, 5, { warmup: true }), set(100, 5)] }]),
      session('open', '2026-10-07', [{ exerciseId: 'Barbell_Squat', sets: [set(100, 5)] }], { finishedAt: undefined }),
    ])
    const r = await run('get_recent_workouts', { days: 7 })
    expect(r.count).toBe(1)
    expect(r.totalVolumeKg).toBe(500)
    expect((r.workouts as { exercises: { sets: string }[] }[])[0].exercises[0].sets).toBe('100x5')
  })

  it('get_exercise_history finds by name and reports bests', async () => {
    await db.sessions.bulkPut([
      session('a', '2026-09-28', [{ exerciseId: 'Barbell_Squat', name: 'Присед', sets: [set(100, 5)] }]),
      session('b', '2026-10-05', [{ exerciseId: 'Barbell_Squat', name: 'Присед', sets: [set(105, 3)] }]),
    ])
    const r = await run('get_exercise_history', { name: 'присед', limit: 1 })
    expect(r.exerciseId).toBe('Barbell_Squat')
    expect(r.bestWeightKg).toBe(105)
    expect(r.history).toHaveLength(1)
    expect((r.history as { date: string }[])[0].date).toBe('2026-10-05')
    expect(await run('get_exercise_history', { name: 'zzz' })).toMatchObject({ error: 'exercise_not_found' })
  })

  it('get_nutrition_summary averages complete days only', async () => {
    const e = (id: string, date: string, kcal: number, proteinG: number) => ({
      id, date, meal: 'lunch' as const, name: 'Еда', grams: 100, kcal, proteinG, carbsG: 10, fatG: 5, createdAt: at(date),
    })
    await db.foodEntries.bulkPut([e('1', '2026-10-05', 2000, 150), e('2', '2026-10-06', 2200, 170), e('3', '2026-10-07', 300, 20)])
    const r = await run('get_nutrition_summary', { days: 7 })
    expect(r.loggedDays).toBe(3)
    expect(r.average).toMatchObject({ kcal: 2100, proteinG: 160 })
    expect(r.averageExcludesToday).toBe(true)
  })

  it('get_sleep_summary', async () => {
    await db.sleep.bulkPut([
      { id: 'a', date: '2026-10-06', bedtime: at('2026-10-05', 23), wakeTime: at('2026-10-06', 7), durationMin: 420, quality: 4 },
      { id: 'b', date: '2026-10-07', bedtime: at('2026-10-06', 23), wakeTime: at('2026-10-07', 6), durationMin: 360, quality: 2 },
    ])
    const r = await run('get_sleep_summary', { days: 3 })
    expect(r.avgMin).toBe(390)
    expect(r.avgQuality).toBe(3)
    expect((r.nights as { bedtime: string }[])[0].bedtime).toBe('23:00')
  })

  it('get_weight_trend', async () => {
    await db.weights.bulkPut([
      { id: '1', date: '2026-09-23', weightKg: 86 },
      { id: '2', date: '2026-09-30', weightKg: 85.5 },
      { id: '3', date: '2026-10-07', weightKg: 85 },
    ])
    const r = await run('get_weight_trend', { days: 30 })
    expect(r.count).toBe(3)
    expect(r.changeKg).toBe(-1)
    expect(r.weeklyRateKg).toBe(-0.5)
  })

  it('get_activities groups by type', async () => {
    await db.activities.bulkPut([
      { id: '1', type: 'swim', date: '2026-10-06', durationMin: 30, distanceKm: 1 },
      { id: '2', type: 'walk', date: '2026-10-05', durationMin: 45 },
      { id: '3', type: 'swim', date: '2026-10-01', durationMin: 40, distanceKm: 1.2 },
    ])
    const r = await run('get_activities', { days: 14 })
    expect(r.count).toBe(3)
    expect((r.byType as Record<string, { count: number; km: number }>).swim).toEqual({ count: 2, minutes: 70, km: 2.2 })
    expect((r.activities as { date: string }[])[0].date).toBe('2026-10-06')
  })

  it('get_habits_status merges manual logs and auto rules', async () => {
    await db.habits.bulkPut([
      { id: 'h1', name: 'Медитация', icon: '🧘', color: 'violet', frequency: 'daily', autoRule: null, sort: 0, archived: false, createdAt: at('2026-01-01') },
      { id: 'h2', name: 'Кардио', icon: '🏃', color: 'info', frequency: 'daily', autoRule: 'cardio', sort: 1, archived: false, createdAt: at('2026-01-01') },
    ])
    await db.habitLogs.bulkPut([
      { id: 'l1', habitId: 'h1', date: '2026-10-05', done: true },
      { id: 'l2', habitId: 'h1', date: '2026-10-06', done: true },
      { id: 'l3', habitId: 'h1', date: '2026-10-07', done: true },
    ])
    await db.activities.put({ id: 'a', type: 'run', date: '2026-10-06', durationMin: 20 })
    const r = await run('get_habits_status')
    expect(r.doneToday).toBe(1)
    const [h1, h2] = r.habits as { streakDays: number; doneToday: boolean; doneLast7: number }[]
    expect(h1.streakDays).toBe(3)
    expect(h2).toMatchObject({ doneToday: false, streakDays: 1, doneLast7: 1 })
  })

  it('get_mood_and_mind', async () => {
    await db.moods.bulkPut([
      { id: '1', date: '2026-10-06', slot: 'morning', mood: 4, stress: 2, createdAt: at('2026-10-06') },
      { id: '2', date: '2026-10-07', slot: 'morning', mood: 2, stress: 4, createdAt: at('2026-10-07') },
    ])
    await db.mindSessions.put({ id: 'm', date: '2026-10-06', kind: 'breathing', durationMin: 5, createdAt: at('2026-10-06') })
    const r = await run('get_mood_and_mind', { days: 7 })
    expect(r).toMatchObject({ avgMood: 3, avgStress: 3, mindMinutes: 5 })
  })

  it('get_week_stats returns this and the previous week', async () => {
    await db.sessions.put(session('s', '2026-10-06', [{ exerciseId: 'Barbell_Squat', sets: [set(100, 5)] }]))
    await db.sessions.put(session('p', '2026-09-29', [{ exerciseId: 'Barbell_Squat', sets: [set(100, 3)] }]))
    const r = await run('get_week_stats')
    expect(r.weekStart).toBe('2026-10-05')
    expect((r.stats as Record<string, number>).workoutVolumeKg).toBe(500)
    expect((r.previous as Record<string, number>).workoutVolumeKg).toBe(300)
  })

  it('get_upcoming_events lists future events only', async () => {
    const ev = (id: string, date: string, hour: number) => ({
      id, title: `Бассейн ${id}`, startAt: at(date, hour), endAt: at(date, hour + 1), allDay: false, source: 'test', kind: 'swim' as const, importedAt: at('2026-10-01'),
    })
    await db.calendarEvents.bulkPut([ev('past', '2026-10-06', 8), ev('soon', '2026-10-08', 8), ev('far', '2026-10-30', 8)])
    const r = await run('get_upcoming_events', { days: 7 })
    expect((r.events as { title: string; start: string }[]).map((e) => e.title)).toEqual(['Бассейн soon'])
    expect((r.events as { start: string }[])[0].start).toBe('08:00')
  })
})

describe('mutating tools', () => {
  it('log_food_entry writes explicit macros or scales from a food', async () => {
    const r = await run('log_food_entry', { name: 'Творог', grams: 200, kcal: 240, proteinG: 34, carbsG: 6, fatG: 9, meal: 'snack' })
    expect(r.ok).toBe(true)
    expect(await db.foodEntries.get(r.id as string)).toMatchObject({ date: '2026-10-07', meal: 'snack', kcal: 240 })
    await db.foods.put({ id: 'rice', name: 'Рис', kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 })
    const r2 = await run('log_food_entry', { foodId: 'rice', grams: 200 })
    expect(await db.foodEntries.get(r2.id as string)).toMatchObject({ name: 'Рис', kcal: 260, proteinG: 5.4, meal: 'breakfast' })
    await expect(run('log_food_entry', { name: 'x', grams: 0, kcal: 1 })).rejects.toThrow()
  })

  it('log_weight replaces the entry of the same day', async () => {
    await run('log_weight', { weightKg: 84.2 })
    const r = await run('log_weight', { weightKg: 84.0 })
    expect(r.replaced).toBe(true)
    const all = await db.weights.toArray()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ date: '2026-10-07', weightKg: 84 })
  })

  it('log_activity validates the type', async () => {
    const r = await run('log_activity', { type: 'swim', durationMin: 30, distanceKm: 1.2 })
    expect(await db.activities.get(r.id as string)).toMatchObject({ type: 'swim', durationMin: 30, distanceKm: 1.2, date: '2026-10-07' })
    await expect(run('log_activity', { type: 'yoga', durationMin: 30 })).rejects.toThrow()
  })

  it('add_note_to_next_session stores one note per exercise', async () => {
    await run('add_note_to_next_session', { exerciseId: 'Barbell_Squat', note: 'Попробуй 102,5 кг' })
    await run('add_note_to_next_session', { exerciseId: 'Barbell_Squat', note: 'Попробуй 105 кг' })
    await run('add_note_to_next_session', { exerciseId: 'Barbell_Deadlift', note: 'Повтори вес' })
    const s = await db.settings.get(NEXT_NOTES_KEY)
    const notes = s?.value as Record<string, { note: string }>
    expect(Object.keys(notes)).toHaveLength(2)
    expect(notes.Barbell_Squat.note).toBe('Попробуй 105 кг')
  })

  it('save_program stores a user program and can activate it', async () => {
    const r = await run('save_program', {
      makeActive: true,
      program: {
        name: 'Верх/низ',
        description: '4 дня',
        days: [
          { name: 'Верх', type: 'upper', weekday: 0, exercises: [{ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Жим', sets: 4, reps: '6-8' }] },
          { name: 'Отдых', type: 'rest', exercises: [] },
        ],
      },
    })
    const p = await db.programs.get(r.id as string)
    expect(p).toMatchObject({ name: 'Верх/низ', isBuiltIn: false, daysPerWeek: 1 })
    expect(p?.days[0].exercises[0]).toMatchObject({ sets: 4, reps: '6-8' })
    expect((await db.settings.get('activeProgramId'))?.value).toBe(r.id)
    await expect(run('save_program', { program: { name: 'x', days: [{ name: 'a', type: 'push', exercises: [] }] } })).rejects.toThrow()
  })
})
