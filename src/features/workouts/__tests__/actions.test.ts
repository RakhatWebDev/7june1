import { beforeEach, describe, expect, it } from 'vitest'
import { FormaDB } from '../../../db'
import { ensureSeeded } from '../../../db/seed'
import { davidLaidDup } from '../../../data/programs/davidLaidDup'
import { weekdayProgram } from './fixtures'
import {
  addExercise,
  addSet,
  applyPreviousWeights,
  deleteSession,
  findActiveSession,
  finishSession,
  removeExercise,
  removeSet,
  startSession,
  updateSet,
} from '../actions'

let n = 0
let database: FormaDB

beforeEach(async () => {
  database = new FormaDB(`test-workouts-actions-${n++}`)
  await ensureSeeded(database)
})

describe('startSession', () => {
  it('creates a session from the program day with the right exercises and empty sets', async () => {
    const id = await startSession('david-laid-dup', 'legs-1', database)
    const s = (await database.sessions.get(id))!
    const day = davidLaidDup.days.find((d) => d.id === 'legs-1')!
    expect(s.programId).toBe('david-laid-dup')
    expect(s.programDayId).toBe('legs-1')
    expect(s.name).toBe(day.name)
    expect(s.finishedAt).toBeUndefined()
    expect(s.exercises).toHaveLength(day.exercises.length)
    expect(s.exercises.map((e) => e.sets.length)).toEqual(day.exercises.map((e) => e.sets))
    expect(s.exercises.flatMap((e) => e.sets).length).toBe(day.exercises.reduce((a, e) => a + e.sets, 0))
  })

  it('does not create a second session while one is active', async () => {
    const first = await startSession('david-laid-dup', 'legs-1', database)
    const again = await startSession('david-laid-dup', 'push-1', database)
    expect(again).toBe(first)
    expect(await database.sessions.count()).toBe(1)
    // Concurrent starts (StrictMode double effects) are serialized as well
    await finishSession(first, database)
    const ids = await Promise.all([
      startSession('david-laid-dup', 'pull-1', database),
      startSession('david-laid-dup', 'pull-1', database),
    ])
    expect(ids[0]).toBe(ids[1])
    expect(await database.sessions.count()).toBe(2)
    expect((await findActiveSession(database))?.id).toBe(ids[0])
  })

  it('refuses rest days and unknown programs', async () => {
    await database.programs.put(weekdayProgram)
    await expect(startSession(weekdayProgram.id, 'rest', database)).rejects.toThrow(/отдыха/)
    await expect(startSession('nope', 'legs-1', database)).rejects.toThrow(/не найдена/)
    expect(await database.sessions.count()).toBe(0)
  })
})

describe('session edits', () => {
  it('updates, adds and removes sets and exercises, persisting immediately', async () => {
    const id = await startSession('david-laid-dup', 'push-1', database)
    await updateSet(id, 0, 0, { weightKg: 80, reps: 4, done: true }, database)
    await addSet(id, 0, database)
    let s = (await database.sessions.get(id))!
    expect(s.exercises[0].sets[0]).toMatchObject({ weightKg: 80, reps: 4, done: true })
    expect(s.exercises[0].sets).toHaveLength(5)
    await removeSet(id, 0, 1, database)
    await applyPreviousWeights(id, 0, [82.5, 85], database)
    s = (await database.sessions.get(id))!
    expect(s.exercises[0].sets.map((x) => x.weightKg)).toEqual([80, 85, 85, 85])

    await addExercise(id, { exerciseId: 'Pushups', name: 'Отжимания' }, database)
    s = (await database.sessions.get(id))!
    expect(s.exercises.at(-1)).toMatchObject({ exerciseId: 'Pushups', targetSets: 3 })
    expect(s.exercises.at(-1)?.sets).toHaveLength(3)
    await removeExercise(id, 0, database)
    s = (await database.sessions.get(id))!
    expect(s.exercises[0].exerciseId).toBe('Push_Press')

    await finishSession(id, database)
    expect((await database.sessions.get(id))?.finishedAt).toBeTruthy()
    expect(await findActiveSession(database)).toBeUndefined()
  })
})

describe('startSession — cyclic programs and auto-regulation', () => {
  const P1 = 'david-laid-program-1'
  const tms = async () => ((await database.settings.get('lifts.trainingMaxes'))?.value ?? {}) as Record<string, number>

  it('resolves per-set targets from % × max and stores the program week and session index', async () => {
    const id = await startSession(P1, 'p1-legs', database)
    const s = (await database.sessions.get(id))!
    expect(s).toMatchObject({ programWeek: 0, programSession: 0 })
    const squat = s.exercises[0]
    expect(squat).toMatchObject({
      exerciseId: 'Barbell_Squat',
      targetSets: 3,
      targetReps: '10-8-6',
    })
    expect(squat.targets).toEqual([
      { reps: '10', pct: 0.6, weightKg: 35 },
      { reps: '8', pct: 0.7, weightKg: 42.5 },
      { reps: '6', pct: 0.8, weightKg: 47.5 },
    ])
    expect(squat.hint).toBe('Тренировочный макс. 60 кг')
    expect(s.exercises[1].targets).toEqual([{ reps: '10' }, { reps: '10' }, { reps: '10' }])
    // the training max is seeded from the tested max
    expect((await tms()).Barbell_Squat).toBe(60)
  })

  it('uses the program-week prescription and skips exercises that are off this week', async () => {
    // 21 finished sessions → program week 8 = document week 4
    await database.settings.put({
      key: `program.cycle:${P1}`,
      value: { startDate: '2026-10-01', completedSessions: 21, nextDayIndex: 5 },
    })
    const id = await startSession(P1, 'p1-pull-2', database)
    const s = (await database.sessions.get(id))!
    expect(s).toMatchObject({ programWeek: 7, programSession: 21 })
    expect(s.exercises.map((e) => e.exerciseId)).not.toContain('Front_Barbell_Squat')
    expect(s.exercises[0]).toMatchObject({ exerciseId: 'Sumo_Deadlift', targetReps: '10-8-6' })
    // no sumo max yet → % only, with a hint to enter the max
    expect(s.exercises[0].targets?.[0]).toEqual({ reps: '10', pct: 0.6 })
    expect(s.exercises[0].hint).toContain('Мои максимумы')
  })

  it('beating the plan raises the training max once; the next session gets heavier targets', async () => {
    const first = await startSession(P1, 'p1-legs', database, new Date('2026-10-05T09:00:00'))
    await updateSet(first, 0, 0, { weightKg: 35, reps: 10, done: true }, database)
    await updateSet(first, 0, 1, { weightKg: 42.5, reps: 8, done: true }, database)
    await updateSet(first, 0, 2, { weightKg: 47.5, reps: 9, done: true }, database)
    await finishSession(first, database, new Date('2026-10-05T10:00:00'))

    const second = await startSession(P1, 'p1-push-1', database, new Date('2026-10-07T09:00:00'))
    expect((await tms()).Barbell_Squat).toBe(60) // squat not in this day — nothing moves
    await deleteSession(second, database)

    // Squat comes back on the second legs day of the rotation: the training max moves 60 → 62,5
    const third = await startSession(P1, 'p1-legs-2', database, new Date('2026-10-09T09:00:00'))
    let s = (await database.sessions.get(third))!
    expect(s.exercises[0].targets?.map((t) => t.weightKg)).toEqual([37.5, 45, 50])
    expect(s.exercises[0].hint).toMatch(/^↑ Тренировочный макс\. 62,5 кг/)
    expect((await tms()).Barbell_Squat).toBe(62.5)

    // Starting again from the same evidence does not raise it twice
    await deleteSession(third, database)
    const fourth = await startSession(P1, 'p1-legs-2', database, new Date('2026-10-09T09:05:00'))
    s = (await database.sessions.get(fourth))!
    expect(s.exercises[0].targets?.map((t) => t.weightKg)).toEqual([37.5, 45, 50])
    expect((await tms()).Barbell_Squat).toBe(62.5)
  })

  it('appends coach notes to the hint and clears them when the session is finished', async () => {
    await database.settings.put({
      key: 'coach.nextNotes',
      value: {
        Leg_Press: { note: 'ноги ниже на платформе', createdAt: '2026-10-01T00:00:00.000Z' },
      },
    })
    const id = await startSession(P1, 'p1-legs', database, new Date('2026-10-05T09:00:00'))
    const s = (await database.sessions.get(id))!
    expect(s.exercises.find((e) => e.exerciseId === 'Leg_Press')?.hint).toBe('Тренер: ноги ниже на платформе')
    await finishSession(id, database, new Date('2026-10-05T10:00:00'))
    expect((await database.settings.get('coach.nextNotes'))?.value).toEqual({})
  })
})

describe('startSession — test week', () => {
  it('week 9 asks for a new max on main lifts (1 × 1 at 100 %) and keeps accessories light', async () => {
    await database.settings.put({
      key: 'program.cycle:david-laid-program-1',
      value: { startDate: '2026-10-01', completedSessions: 24, nextDayIndex: 0 },
    })
    const id = await startSession('david-laid-program-1', 'p1-legs', database)
    const s = (await database.sessions.get(id))!
    expect(s.programWeek).toBe(8)
    expect(s.exercises[0]).toMatchObject({ exerciseId: 'Barbell_Squat', targetSets: 1, targetReps: '1' })
    expect(s.exercises[0].targets).toEqual([{ reps: '1', pct: 1, weightKg: 60 }])
    expect(s.exercises[0].notes).toContain('тестовая неделя')
    expect(s.exercises[1]).toMatchObject({ exerciseId: 'Leg_Press', targetSets: 2, targetReps: '10' })
  })
})
