import { describe, expect, it } from 'vitest'
import type { Measurement, SessionExercise, WorkoutSession } from '../../db/types'
import {
  activeDates,
  calendarGrid,
  currentStreak,
  epley1RM,
  longestStreak,
  measurementDelta,
  movingAverage,
  personalRecords,
  sessionVolume,
  weeklyVolume,
} from './calc'

/** Local-time ISO timestamp for a calendar day at noon (avoids TZ edge cases). */
const at = (date: string, hour = 12) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, hour).toISOString()
}

const ex = (exerciseId: string, sets: [number | null, number | null, boolean, boolean?][]): SessionExercise => ({
  exerciseId,
  name: exerciseId,
  targetSets: sets.length,
  targetReps: '5',
  sets: sets.map(([weightKg, reps, done, warmup]) => ({ weightKg, reps, done, warmup })),
})

const session = (date: string, exercises: SessionExercise[], finished = true): WorkoutSession => ({
  id: `s-${date}-${Math.random()}`,
  name: 'Test',
  startedAt: at(date),
  finishedAt: finished ? at(date, 13) : undefined,
  exercises,
})

describe('movingAverage', () => {
  it('averages over trailing 7 calendar days, not 7 entries', () => {
    const points = movingAverage([
      { date: '2026-10-01', weightKg: 90 },
      { date: '2026-10-03', weightKg: 88 },
      { date: '2026-10-07', weightKg: 86 },
      // 2026-10-08 is 7 days after 10-01 → 10-01 drops out of the window
      { date: '2026-10-08', weightKg: 84 },
    ])
    expect(points.map((p) => p.avgKg)).toEqual([90, 89, 88, 86])
  })

  it('sorts input and merges several entries of the same day', () => {
    const points = movingAverage([
      { date: '2026-10-02', weightKg: 80 },
      { date: '2026-10-01', weightKg: 81 },
      { date: '2026-10-01', weightKg: 83 },
    ])
    expect(points).toEqual([
      { date: '2026-10-01', weightKg: 82, avgKg: 82 },
      { date: '2026-10-02', weightKg: 80, avgKg: 81 },
    ])
  })

  it('returns an empty list for no data', () => {
    expect(movingAverage([])).toEqual([])
  })
})

describe('volume', () => {
  it('counts only done non-warmup sets', () => {
    const s = session('2026-10-05', [
      ex('Squat', [
        [60, 5, true, true], // warm-up
        [100, 5, true],
        [100, 5, true],
        [100, 5, false], // not done
        [null, 5, true], // no weight
      ]),
    ])
    expect(sessionVolume(s)).toBe(1000)
  })

  it('groups volume and workout count by Monday-based week for the last 12 weeks', () => {
    const now = new Date(2026, 9, 7, 18) // Wed 2026-10-07
    const weeks = weeklyVolume(
      [
        session('2026-10-05', [ex('Squat', [[100, 5, true]])]), // Mon, current week
        session('2026-10-07', [ex('Bench', [[80, 5, true]])]), // Wed, current week
        session('2026-10-04', [ex('Squat', [[100, 3, true]])]), // Sun, previous week
        session('2026-07-01', [ex('Squat', [[100, 3, true]])]), // too old
      ],
      12,
      now,
    )
    expect(weeks).toHaveLength(12)
    expect(weeks[11]).toMatchObject({ weekStart: '2026-10-05', volumeKg: 900, sessions: 2, label: '05.10' })
    expect(weeks[10]).toMatchObject({ weekStart: '2026-09-28', volumeKg: 300, sessions: 1 })
    expect(weeks[0].weekStart).toBe('2026-07-20')
    expect(weeks.reduce((a, w) => a + w.sessions, 0)).toBe(3)
  })
})

describe('personalRecords', () => {
  it('finds max weight and best Epley 1RM per exercise with dates', () => {
    const prs = personalRecords([
      session('2026-09-01', [
        ex('Squat', [
          [140, 1, true, true], // warm-up must be ignored even if heavy
          [100, 10, true], // 1RM 133.3
        ]),
        ex('Bench', [[80, 5, true]]),
      ]),
      session('2026-09-10', [ex('Squat', [[120, 2, true], [125, 1, false]])]), // 1RM 128, max 120
    ])
    const squat = prs.find((p) => p.exerciseId === 'Squat')!
    expect(squat.maxWeightKg).toBe(120)
    expect(squat.maxWeightReps).toBe(2)
    expect(squat.maxWeightDate).toBe('2026-09-10')
    expect(squat.best1RM).toBeCloseTo(133.3, 1)
    expect(squat.best1RMDate).toBe('2026-09-01')
    expect(prs[0].exerciseId).toBe('Squat') // sorted by 1RM desc
    expect(prs.find((p) => p.exerciseId === 'Bench')?.best1RM).toBeCloseTo(93.3, 1)
  })

  it('uses the Epley formula from the contract', () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.67, 2)
    expect(epley1RM(80, 0)).toBe(80)
  })

  it('returns nothing without completed working sets', () => {
    expect(personalRecords([session('2026-09-01', [ex('Squat', [[100, 5, false]])])])).toEqual([])
  })
})

describe('streak', () => {
  const dates = activeDates(
    [
      session('2026-10-05', [ex('Squat', [[100, 5, true]])]),
      session('2026-10-06', [ex('Squat', [[100, 5, false]])], false), // empty, unfinished → not active
    ],
    [{ date: '2026-10-04' }, { date: '2026-10-06' }, { date: '2026-10-01' }, { date: '2026-09-30' }],
  )

  it('collects active days from sessions and activities', () => {
    expect([...dates].sort()).toEqual(['2026-09-30', '2026-10-01', '2026-10-04', '2026-10-05', '2026-10-06'])
  })

  it('counts consecutive days ending today', () => {
    expect(currentStreak(new Set([...dates, '2026-10-07']), '2026-10-07')).toBe(4)
  })

  it('keeps the streak alive when today is still empty', () => {
    expect(currentStreak(dates, '2026-10-07')).toBe(3)
  })

  it('is zero after a missed day', () => {
    expect(currentStreak(dates, '2026-10-08')).toBe(0)
    expect(currentStreak(new Set(), '2026-10-08')).toBe(0)
  })

  it('finds the longest streak', () => {
    expect(longestStreak(dates)).toBe(3)
    expect(longestStreak(new Set())).toBe(0)
  })

  it('builds an 8-week Monday-based calendar grid', () => {
    const grid = calendarGrid(dates, 8, new Date(2026, 9, 7, 9))
    expect(grid).toHaveLength(8)
    expect(grid.every((w) => w.length === 7)).toBe(true)
    expect(grid[0][0].date).toBe('2026-08-17')
    expect(grid[7][0].date).toBe('2026-10-05')
    expect(grid[7][0].active).toBe(true)
    expect(grid[7][2]).toMatchObject({ date: '2026-10-07', active: false, future: false })
    expect(grid[7][3].future).toBe(true)
  })
})

describe('measurementDelta', () => {
  it('diffs fields present in both records', () => {
    const prev: Measurement = { id: 'a', date: '2026-09-01', waistCm: 84, chestCm: 104 }
    const cur: Measurement = { id: 'b', date: '2026-10-01', waistCm: 82.5, chestCm: 105, armCm: 39 }
    expect(measurementDelta(cur, prev)).toEqual({ waistCm: -1.5, chestCm: 1 })
    expect(measurementDelta(cur, undefined)).toEqual({})
  })
})
