import { beforeEach, describe, expect, it } from 'vitest'
import { FormaDB } from '../../../db'
import { ensureSeeded } from '../../../db/seed'
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
  todayLabel,
} from '../schedule'
import { weekdayProgram } from './fixtures'

const P1 = davidLaidProgram1
const mon = new Date('2026-10-05T09:00:00')
const wed = new Date('2026-10-07T09:00:00')
const state = (completedSessions: number, nextDayIndex = completedSessions % 6) => ({
  startDate: '2026-10-01',
  completedSessions,
  nextDayIndex,
})

describe('resolveSchedule (pure)', () => {
  it('a program week is 3 finished sessions; days rotate independently', () => {
    const s = resolveSchedule(P1, undefined, wed)
    expect(s).toMatchObject({ dayIndex: 0, week: 0, sessionInWeek: 0, sessionsPerWeek: 3, completedSessions: 0 })
    expect(scheduleLabel(s)).toBe('Неделя 1 из 12 · тренировка 1 из 3')
    expect(todayLabel(s)).toBe('Неделя 1 из 12 · Ноги')

    const s2 = resolveSchedule(P1, state(7), wed) // 7 done → week 3, session 2; rotation at day 2 (Жим 1)
    expect(s2.day?.id).toBe('p1-push-1')
    expect(s2.week).toBe(2)
    expect(scheduleLabel(s2)).toBe('Неделя 3 из 12 · тренировка 2 из 3')
    expect(todayLabel(s2)).toBe('Неделя 3 из 12 · Жим 1')
  })

  it('marks the test week and the end of the program', () => {
    const test = resolveSchedule(P1, state(24), wed)
    expect(test).toMatchObject({ week: 8, isTestWeek: true, isComplete: false })
    expect(scheduleLabel(test)).toBe('Неделя 9 из 12 (тест) · тренировка 1 из 3')
    const done = resolveSchedule(P1, state(36), wed)
    expect(done).toMatchObject({ week: 12, prescriptionWeek: 11, isComplete: true })
    expect(scheduleLabel(done)).toBe('Программа пройдена (12 нед.)')
  })

  it('a legacy week override counts as full weeks of sessions', () => {
    const s = resolveSchedule(P1, { startDate: '2026-10-01', week: 2, nextDayIndex: 1 }, wed)
    expect(s).toMatchObject({ week: 2, completedSessions: 6, dayIndex: 1 })
  })

  it('weekday programs keep the weekday behaviour', () => {
    expect(resolveSchedule(weekdayProgram, undefined, mon).day?.id).toBe('legs-1')
    expect(resolveSchedule(weekdayProgram, undefined, mon).week).toBeUndefined()
    expect(scheduleLabel(resolveSchedule(weekdayProgram, undefined, mon))).toBeUndefined()
    expect(advanceCycle(weekdayProgram, undefined, 'legs-1', mon)).toBeNull()
  })

  it('finishing a session counts it and continues the rotation after that day', () => {
    expect(advanceCycle(P1, undefined, 'p1-legs', wed)).toMatchObject({ completedSessions: 1, nextDayIndex: 1 })
    expect(advanceCycle(P1, state(5), 'p1-pull-2', wed)).toEqual({
      startDate: '2026-10-01',
      completedSessions: 6,
      nextDayIndex: 0,
    })
    // an out-of-order day still counts; the rotation continues after it
    expect(advanceCycle(P1, state(1), 'p1-push-2', wed)).toMatchObject({ completedSessions: 2, nextDayIndex: 5 })
    expect(advanceCycle(P1, state(1), 'unknown', wed)).toBeNull()
  })

  it('labels sessions by their position in the program', () => {
    expect(sessionCycleLabel(P1, { programWeek: 2, programSession: 7 })).toBe('Неделя 3 из 12 · тренировка 2 из 3')
    expect(sessionCycleLabel(P1, { programWeek: 8, programSession: 25 })).toBe(
      'Неделя 9 из 12 (тест) · тренировка 2 из 3',
    )
    expect(sessionCycleLabel(P1, { programWeek: 1 })).toBe('Неделя 2 из 12')
    expect(sessionCycleLabel(weekdayProgram, { programWeek: undefined })).toBeUndefined()
  })
})

let n = 0
let database: FormaDB
beforeEach(async () => {
  database = new FormaDB(`test-schedule-${n++}`)
  await ensureSeeded(database)
})

describe('schedule with the database', () => {
  it('3 finished sessions = 1 program week; the 4th session in a calendar week continues the rotation', async () => {
    const program = (await database.programs.get(P1.id))!
    const expected = ['p1-legs', 'p1-push-1', 'p1-pull-1', 'p1-legs-2']
    for (let i = 0; i < 4; i++) {
      const s = await getScheduledDay(database, program, wed)
      expect(s.day?.id).toBe(expected[i])
      const id = await startSession(P1.id, s.day!.id, database, wed)
      const session = (await database.sessions.get(id))!
      expect(session.programSession).toBe(i)
      expect(session.programWeek).toBe(i < 3 ? 0 : 1)
      await finishSession(id, database, wed)
    }
    const after = await getScheduledDay(database, program, wed)
    expect(after.day?.id).toBe('p1-push-2')
    expect(scheduleLabel(after)).toBe('Неделя 2 из 12 · тренировка 2 из 3')
  })

  it('manual week choice jumps the session counter; restart goes back to week 1, first day', async () => {
    await setCycleWeek(database, P1, 8, wed)
    const s = await getScheduledDay(database, P1, wed)
    expect(s).toMatchObject({ week: 8, isTestWeek: true, completedSessions: 24 })
    await restartCycle(database, P1.id, wed)
    expect((await database.settings.get(cycleKey(P1.id)))?.value).toEqual({
      startDate: '2026-10-07',
      completedSessions: 0,
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
    expect(await getWeeklyProgress(database, new Date('2026-10-12T09:00:00'))).toEqual({ done: 0, target: 4 })
  })
})
