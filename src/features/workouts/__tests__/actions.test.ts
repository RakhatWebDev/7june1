import { beforeEach, describe, expect, it } from 'vitest'
import { FormaDB } from '../../../db'
import { ensureSeeded } from '../../../db/seed'
import { davidLaidDup } from '../../../data/programs/davidLaidDup'
import {
  addExercise,
  addSet,
  applyPreviousWeights,
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
    await expect(startSession('david-laid-dup', 'rest', database)).rejects.toThrow(/отдыха/)
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
