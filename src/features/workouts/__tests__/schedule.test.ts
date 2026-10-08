import { beforeEach, describe, expect, it } from 'vitest'
import { FormaDB } from '../../../db'
import { ensureSeeded } from '../../../db/seed'
import { davidLaidDup } from '../../../data/programs/davidLaidDup'
import { davidLaidProgram1 } from '../../../data/programs/davidLaidProgram1'
import { finishSession, startSession } from '../actions'
import {
  advanceCycle,
  cycleKey,
  getScheduledDay,
  getWeeklyProgress,
  resolveSchedule,
  restartCycle,
  scheduleLabel,
  sessionCycleLabel,
  setCycleWeek,
  setTargetPerWeek,
} from '../schedule'

const P1 = davidLaidProgram1
const mon = new Date('2026-10-05T09:00:00')
const wed = new Date('2026-10-07T09:00:00')

describe('resolveSchedule (pure)', () => {
  it('sequential: starts at day 1 of week 1 and follows nextDayIndex', () => {
    const s = resolveSchedule(P1, undefined, wed)
    expect(s.day?.id).toBe('p1-legs')
    expect(s.week).toBe(0)
    expect(scheduleLabel(s)).toBe('Неделя 1 · день 1 из 5')
    const s2 = resolveSchedule(P1, { startDate: '2026-10-01', week: 1, nextDayIndex: 2 }, wed)
    expect(s2.day?.id).toBe('p1-pull-1')
    expect(scheduleLabel(s2)).toBe('Неделя 2 · день 3 из 5')
  })

  it('weekday programs keep the weekday behaviour', () => {
    expect(resolveSchedule(davidLaidDup, undefined, mon).day?.id).toBe('legs-1')
    expect(resolveSchedule(davidLaidDup, undefined, mon).week).toBeUndefined()
    expect(scheduleLabel(resolveSchedule(davidLaidDup, undefined, mon))).toBeUndefined()
  })

  it('derives the week from startDate only when there is no explicit week', () => {
    const s = resolveSchedule({ ...P1, schedule: 'weekday' }, { startDate: '2026-09-21' }, wed)
    expect(s.week).toBe(2)
  })

  it('advances only on the scheduled day, wraps and increments the week', () => {
    expect(advanceCycle(P1, undefined, 'p1-push-1', wed)).toBeNull()
    expect(advanceCycle(P1, undefined, 'p1-legs', wed)).toMatchObject({ week: 0, nextDayIndex: 1 })
    const last = { startDate: '2026-10-01', week: 0, nextDayIndex: 4 }
    expect(advanceCycle(P1, last, 'p1-pull-2', wed)).toEqual({
      startDate: '2026-10-01',
      week: 1,
      nextDayIndex: 0,
    })
    expect(advanceCycle(davidLaidDup, undefined, 'legs-1', mon)).toBeNull()
  })

  it('after week 4 it is the test week (prescriptions clamp to week 4)', () => {
    const s = resolveSchedule(P1, { startDate: '2026-09-01', week: 4, nextDayIndex: 0 }, wed)
    expect(s.isTestWeek).toBe(true)
    expect(s.prescriptionWeek).toBe(3)
    expect(scheduleLabel(s)).toBe('Тестовая неделя · день 1 из 5')
  })

  it('labels sessions of cyclic programs', () => {
    expect(sessionCycleLabel(P1, 'p1-push-2', 1)).toBe('Неделя 2 · день 4 из 5')
    expect(sessionCycleLabel(davidLaidDup, 'legs-1', undefined)).toBeUndefined()
  })
})

let n = 0
let database: FormaDB
beforeEach(async () => {
  database = new FormaDB(`test-schedule-${n++}`)
  await ensureSeeded(database)
})

describe('schedule with the database', () => {
  it('finishing the scheduled day moves Program 1 to the next day; 5 days = next week', async () => {
    const program = (await database.programs.get(P1.id))!
    for (let i = 0; i < 5; i++) {
      const s = await getScheduledDay(database, program, wed)
      expect(s.dayIndex).toBe(i)
      const id = await startSession(P1.id, s.day!.id, database, wed)
      await finishSession(id, database, wed)
    }
    const after = await getScheduledDay(database, program, wed)
    expect(after.day?.id).toBe('p1-legs')
    expect(after.week).toBe(1)
    expect(scheduleLabel(after)).toBe('Неделя 2 · день 1 из 5')
  })

  it('finishing another day does not advance the rotation', async () => {
    const id = await startSession(P1.id, 'p1-push-2', database, wed)
    await finishSession(id, database, wed)
    expect((await getScheduledDay(database, P1, wed)).day?.id).toBe('p1-legs')
  })

  it('manual week override and restart', async () => {
    await setCycleWeek(database, P1, 2, wed)
    expect((await getScheduledDay(database, P1, wed)).week).toBe(2)
    await restartCycle(database, P1.id, wed)
    expect((await database.settings.get(cycleKey(P1.id)))?.value).toEqual({
      startDate: '2026-10-07',
      week: 0,
      nextDayIndex: 0,
    })
  })

  it('counts finished sessions of the calendar week against the target (default 3)', async () => {
    expect(await getWeeklyProgress(database, wed)).toEqual({ done: 0, target: 3 })
    const a = await startSession(P1.id, 'p1-legs', database, mon)
    await finishSession(a, database, mon)
    await startSession(P1.id, 'p1-push-1', database, wed) // still active — not counted
    await setTargetPerWeek(database, 4)
    expect(await getWeeklyProgress(database, wed)).toEqual({ done: 1, target: 4 })
    expect(await getWeeklyProgress(database, new Date('2026-10-12T09:00:00'))).toEqual({
      done: 0,
      target: 4,
    })
  })
})
