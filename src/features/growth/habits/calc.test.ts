import { describe, expect, it } from 'vitest'
import type { Habit, HabitLog } from '../../../db/types'
import { shiftDate } from '../shared'
import {
  allDoneStreak,
  bestStreak,
  buildAutoIndex,
  completionRate,
  dailyStreak,
  habitStatus,
  habitStreak,
  isAutoDone,
  isEarlyBedtime,
  isWeekSuccess,
  todaySummary,
  weekCount,
  weeklyStreak,
  type AutoData,
} from './calc'

// 2026-10-07 is a Wednesday; its week runs 2026-10-05 (Mon) … 2026-10-11 (Sun).
const TODAY = '2026-10-07'
const days = (...offsets: number[]) => new Set(offsets.map((o) => shiftDate(TODAY, o)))

const emptyData: AutoData = { sessions: [], activities: [], water: [], sleep: [], readingLogs: [] }

/** Local timestamp helper so tests do not depend on the machine's time zone. */
const local = (date: string, h: number, m = 0) => {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).toISOString()
}

describe('dailyStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(dailyStreak(days(0, -1, -2, -4), TODAY)).toBe(3)
  })

  it('does not break when today is not marked yet', () => {
    expect(dailyStreak(days(-1, -2, -3), TODAY)).toBe(3)
  })

  it('is 0 when yesterday and today are missed', () => {
    expect(dailyStreak(days(-2, -3), TODAY)).toBe(0)
    expect(dailyStreak(new Set(), TODAY)).toBe(0)
  })

  it('crosses month boundaries', () => {
    expect(dailyStreak(new Set(['2026-09-29', '2026-09-30', '2026-10-01']), '2026-10-01')).toBe(3)
  })
})

describe('weekly habits', () => {
  it('weekly success needs 3 of 7 days in the Monday-based week', () => {
    // Mon, Tue, Wed of the current week
    expect(weekCount(days(-2, -1, 0), TODAY)).toBe(3)
    expect(isWeekSuccess(days(-2, -1, 0), TODAY, 3)).toBe(true)
    expect(isWeekSuccess(days(-2, 0), TODAY, 3)).toBe(false)
    // days from the previous week (Sun 10-04) do not count for this week
    expect(isWeekSuccess(days(-3, -2, 0), TODAY, 3)).toBe(false)
  })

  it('weekly streak counts successful weeks and does not break during the running week', () => {
    const prevWeeks = new Set([
      '2026-09-28', '2026-09-30', '2026-10-02', // week of 09-28: 3 ✓
      '2026-09-21', '2026-09-22', '2026-09-23', // week of 09-21: 3 ✓
      '2026-09-15', // week of 09-14: 1 ✗
    ])
    expect(weeklyStreak(prevWeeks, TODAY, 3)).toBe(2)
    const withCurrent = new Set([...prevWeeks, '2026-10-05', '2026-10-06', '2026-10-07'])
    expect(weeklyStreak(withCurrent, TODAY, 3)).toBe(3)
    expect(habitStreak({ frequency: 'weekly', targetPerWeek: 3 }, withCurrent, TODAY)).toBe(3)
  })
})

describe('completionRate', () => {
  it('daily: done days over the last 30 days', () => {
    const done = new Set(Array.from({ length: 15 }, (_, i) => shiftDate(TODAY, -i * 2)))
    expect(completionRate({ frequency: 'daily' }, done, TODAY)).toBeCloseTo(0.5)
    // a day outside the window is ignored
    expect(completionRate({ frequency: 'daily' }, days(-30), TODAY)).toBe(0)
  })

  it('shortens the window for a habit created recently', () => {
    expect(completionRate({ frequency: 'daily' }, days(0, -1), TODAY, 30, shiftDate(TODAY, -3))).toBeCloseTo(0.5)
  })

  it('weekly: relative to the expected target and capped at 100%', () => {
    // 30 days × 3/7 ≈ 12.86 expected
    const done = new Set(Array.from({ length: 6 }, (_, i) => shiftDate(TODAY, -i * 5)))
    expect(completionRate({ frequency: 'weekly', targetPerWeek: 3 }, done, TODAY)).toBeCloseTo(6 / (90 / 7))
    const all = new Set(Array.from({ length: 30 }, (_, i) => shiftDate(TODAY, -i)))
    expect(completionRate({ frequency: 'weekly', targetPerWeek: 3 }, all, TODAY)).toBe(1)
  })
})

describe('bestStreak', () => {
  it('finds the longest daily run', () => {
    expect(bestStreak({ frequency: 'daily' }, days(-10, -9, -8, -7, -3, -2), shiftDate(TODAY, -30), TODAY)).toBe(4)
  })

  it('finds the longest weekly run', () => {
    const done = new Set(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-28', '2026-09-29', '2026-09-30'])
    expect(bestStreak({ frequency: 'weekly', targetPerWeek: 3 }, done, '2026-09-01', TODAY)).toBe(2)
  })
})

describe('isAutoDone', () => {
  it('water: total intake reaches the profile target', () => {
    const data: AutoData = {
      ...emptyData,
      water: [
        { date: TODAY, ml: 1500 },
        { date: TODAY, ml: 1000 },
        { date: '2026-10-06', ml: 3000 },
      ],
      waterTargetMl: 2500,
    }
    expect(isAutoDone('water', TODAY, data)).toBe(true)
    expect(isAutoDone('water', TODAY, { ...data, waterTargetMl: 3000 })).toBe(false)
    expect(isAutoDone('water', '2026-10-06', { ...data, waterTargetMl: undefined })).toBe(true) // default 3000
    expect(isAutoDone('water', '2026-10-05', data)).toBe(false)
  })

  it('workout: a finished session on that day; unfinished sessions do not count', () => {
    const data: AutoData = {
      ...emptyData,
      sessions: [{ finishedAt: local(TODAY, 19, 30) }, { finishedAt: undefined }],
    }
    expect(isAutoDone('workout', TODAY, data)).toBe(true)
    expect(isAutoDone('workout', '2026-10-06', data)).toBe(false)
    expect(isAutoDone('workout', TODAY, { ...emptyData, sessions: [{ finishedAt: undefined }] })).toBe(false)
  })

  it('cardio vs stretch activities', () => {
    const data: AutoData = {
      ...emptyData,
      activities: [
        { date: TODAY, type: 'stretch' },
        { date: '2026-10-06', type: 'run' },
      ],
    }
    expect(isAutoDone('stretch', TODAY, data)).toBe(true)
    expect(isAutoDone('cardio', TODAY, data)).toBe(false)
    expect(isAutoDone('cardio', '2026-10-06', data)).toBe(true)
  })

  it('sleep: bedtime at or before 23:30 local', () => {
    expect(isEarlyBedtime(local('2026-10-06', 23, 30))).toBe(true)
    expect(isEarlyBedtime(local('2026-10-06', 23, 31))).toBe(false)
    expect(isEarlyBedtime(local(TODAY, 0, 15))).toBe(false)
    const data: AutoData = { ...emptyData, sleep: [{ date: TODAY, bedtime: local('2026-10-06', 22, 45) }] }
    expect(isAutoDone('sleep', TODAY, data)).toBe(true)
    expect(isAutoDone('sleep', '2026-10-06', data)).toBe(false)
  })

  it('reading: ≥ 20 minutes or ≥ 10 pages', () => {
    const data: AutoData = {
      ...emptyData,
      readingLogs: [
        { date: TODAY, pages: 0, minutes: 20 },
        { date: '2026-10-06', pages: 10 },
        { date: '2026-10-05', pages: 5, minutes: 15 },
      ],
    }
    expect(isAutoDone('reading', TODAY, data)).toBe(true)
    expect(isAutoDone('reading', '2026-10-06', data)).toBe(true)
    expect(isAutoDone('reading', '2026-10-05', data)).toBe(false)
  })

  it('null rule is never auto-done', () => {
    expect(isAutoDone(null, TODAY, emptyData)).toBe(false)
  })
})

describe('habitStatus', () => {
  it('auto completion shows unless a manual log overrides it', () => {
    const auto = buildAutoIndex({ ...emptyData, activities: [{ date: TODAY, type: 'run' }, { date: '2026-10-06', type: 'run' }] })
    const logs: HabitLog[] = [
      { id: 'a', habitId: 'h', date: '2026-10-06', done: false },
      { id: 'b', habitId: 'h', date: '2026-10-05', done: true },
      { id: 'c', habitId: 'other', date: '2026-10-04', done: true },
    ]
    const st = habitStatus({ id: 'h', autoRule: 'cardio' }, logs, auto)
    expect([...st.done].sort()).toEqual(['2026-10-05', TODAY])
    expect([...st.auto]).toEqual([TODAY])
  })
})

describe('all-daily streak and today summary', () => {
  const habit = (id: string, frequency: Habit['frequency'], archived = false): Habit => ({
    id,
    name: id,
    icon: '✅',
    color: 'accent',
    frequency,
    autoRule: null,
    sort: 0,
    archived,
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  it('counts days where every daily habit was done', () => {
    expect(allDoneStreak([days(0, -1, -2), days(-1, -2, -3)], TODAY)).toBe(2)
    expect(allDoneStreak([], TODAY)).toBe(0)
  })

  it('summarises today and ignores archived and weekly habits for the streak', () => {
    const habits = [habit('a', 'daily'), habit('b', 'daily'), habit('w', 'weekly'), habit('x', 'daily', true)]
    const status = new Map([
      ['a', { done: days(0, -1), auto: new Set<string>(), manual: new Map() }],
      ['b', { done: days(-1), auto: new Set<string>(), manual: new Map() }],
      ['w', { done: days(0), auto: new Set<string>(), manual: new Map() }],
      ['x', { done: new Set<string>(), auto: new Set<string>(), manual: new Map() }],
    ])
    const s = todaySummary(habits, status, TODAY)
    expect(s.total).toBe(3)
    expect(s.done).toBe(2)
    expect(s.streak).toBe(1)
  })
})
