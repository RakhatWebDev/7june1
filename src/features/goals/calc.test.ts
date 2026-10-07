import { describe, expect, it } from 'vitest'
import type { LifeGoal } from '../../db/types'
import {
  cleanLines,
  deltaTone,
  goalProgress,
  isReviewDay,
  krProgress,
  krStep,
  padLines,
  reviewTargetWeek,
  shiftWeek,
  weekDeltas,
  weekEndOf,
  weekLabel,
  weekStartOf,
  wheelValues,
  type GoalKeyResult,
} from './calc'
import { METRICS } from './metrics'

const kr = (
  start: number,
  current: number,
  target: number,
  extra: Partial<GoalKeyResult> = {},
): GoalKeyResult => ({
  id: `kr-${Math.random()}`,
  title: 'KR',
  start,
  current,
  target,
  ...extra,
})

const goal = (
  area: LifeGoal['area'],
  status: LifeGoal['status'],
  keyResults: GoalKeyResult[],
): LifeGoal => ({
  id: `g-${Math.random()}`,
  area,
  title: 'Goal',
  status,
  keyResults,
  sort: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
})

describe('krProgress', () => {
  it('measures increasing targets from the start value', () => {
    expect(krProgress(kr(0, 3, 5))).toBe(60)
    expect(krProgress(kr(10, 15, 20))).toBe(50)
  })

  it('measures decreasing targets: weight 88 → 82 at 85 is 50%', () => {
    expect(krProgress(kr(88, 85, 82))).toBe(50)
    expect(krProgress(kr(88, 88, 82))).toBe(0)
    expect(krProgress(kr(88, 82, 82))).toBe(100)
  })

  it('clamps to 0–100 when overshooting or going backwards', () => {
    expect(krProgress(kr(88, 80, 82))).toBe(100)
    expect(krProgress(kr(88, 90, 82))).toBe(0)
    expect(krProgress(kr(0, 7, 5))).toBe(100)
    expect(krProgress(kr(0, -1, 5))).toBe(0)
  })

  it('defaults a missing start to 0 and handles start === target', () => {
    expect(krProgress({ id: 'x', title: 'Сон', current: 6, target: 8 })).toBe(75)
    expect(krProgress(kr(5, 5, 5))).toBe(100)
    expect(krProgress(kr(5, 4, 5))).toBe(0)
  })
})

describe('goalProgress', () => {
  it('averages KR progress', () => {
    expect(goalProgress(goal('body', 'active', [kr(88, 85, 82), kr(0, 5, 5), kr(0, 0, 8)]))).toBe(
      50,
    )
  })

  it('is 0 without KRs unless the goal is done', () => {
    expect(goalProgress(goal('mind', 'active', []))).toBe(0)
    expect(goalProgress(goal('mind', 'done', []))).toBe(100)
  })
})

describe('wheelValues', () => {
  it('averages KRs of active goals per area; empty areas are 0', () => {
    const goals = [
      goal('body', 'active', [kr(88, 85, 82), kr(0, 5, 5)]), // 50, 100
      goal('body', 'active', [kr(0, 0, 8)]), // 0
      goal('body', 'done', [kr(0, 10, 10)]), // ignored: not active
      goal('finance', 'active', [kr(0, 1, 4)]), // 25
      goal('mind', 'paused', [kr(0, 4, 4)]), // ignored
    ]
    const wheel = wheelValues(goals)
    expect(wheel.map((w) => w.area)).toEqual([
      'body',
      'mind',
      'finance',
      'career',
      'relationships',
      'spirit',
      'learning',
    ])
    const by = Object.fromEntries(wheel.map((w) => [w.area, w.value]))
    expect(by).toEqual({
      body: 50,
      mind: 0,
      finance: 25,
      career: 0,
      relationships: 0,
      spirit: 0,
      learning: 0,
    })
    expect(wheel.find((w) => w.area === 'body')?.goals).toBe(2)
  })

  it('returns all zeros without goals', () => {
    expect(wheelValues([]).every((w) => w.value === 0)).toBe(true)
  })
})

describe('weekDeltas', () => {
  it('computes signed differences, directions and tones against the previous week', () => {
    const current = { workouts: 4, spent: 12000, avgKcal: 2400, habitsPct: 70, moodAvg: 3.8 }
    const previous = { workouts: 3, spent: 15000, avgKcal: 2600, habitsPct: 70, moodAvg: 4.1 }
    const by = Object.fromEntries(weekDeltas(current, previous).map((d) => [d.key, d]))
    expect(by.workouts).toMatchObject({
      current: 4,
      previous: 3,
      diff: 1,
      direction: 'up',
      tone: 'good',
    })
    expect(by.spent).toMatchObject({ diff: -3000, direction: 'down', tone: 'good' })
    expect(by.avgKcal).toMatchObject({ diff: -200, direction: 'down', tone: 'neutral' })
    expect(by.habitsPct).toMatchObject({ diff: 0, direction: 'flat', tone: 'neutral' })
    expect(by.moodAvg).toMatchObject({ diff: -0.3, direction: 'down', tone: 'bad' })
  })

  it('treats a missing previous week as zeros and covers every metric', () => {
    const deltas = weekDeltas({ cardioMin: 90 }, undefined)
    expect(deltas).toHaveLength(METRICS.length)
    expect(deltas.find((d) => d.key === 'cardioMin')).toMatchObject({
      diff: 90,
      direction: 'up',
      tone: 'good',
    })
    expect(deltas.find((d) => d.key === 'workouts')).toMatchObject({ diff: 0, direction: 'flat' })
  })

  it('deltaTone respects which direction is better', () => {
    expect(deltaTone(5, 'up')).toBe('good')
    expect(deltaTone(-5, 'up')).toBe('bad')
    expect(deltaTone(5, 'down')).toBe('bad')
    expect(deltaTone(-5, 'down')).toBe('good')
    expect(deltaTone(5, 'neutral')).toBe('neutral')
  })
})

describe('weeks', () => {
  it('finds Monday and shifts weeks', () => {
    expect(weekStartOf('2026-10-07')).toBe('2026-10-05')
    expect(weekStartOf('2026-10-11')).toBe('2026-10-05')
    expect(shiftWeek('2026-10-05', -1)).toBe('2026-09-28')
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04')
    expect(weekEndOf('2026-10-05')).toBe('2026-10-11')
    expect(weekLabel('2026-10-05')).toBe('05.10 – 11.10')
  })

  it('reviews the current week on Sunday and the previous one otherwise', () => {
    const sunday = new Date(2026, 9, 11, 20)
    const monday = new Date(2026, 9, 12, 9)
    const wednesday = new Date(2026, 9, 7, 9)
    expect(isReviewDay(sunday)).toBe(true)
    expect(isReviewDay(monday)).toBe(true)
    expect(isReviewDay(wednesday)).toBe(false)
    expect(reviewTargetWeek(sunday)).toBe('2026-10-05')
    expect(reviewTargetWeek(monday)).toBe('2026-10-05')
    expect(reviewTargetWeek(wednesday)).toBe('2026-09-28')
  })
})

describe('helpers', () => {
  it('krStep uses half units for kg / hours / fractions', () => {
    expect(krStep(kr(88, 88, 82, { unit: 'кг' }))).toBe(0.5)
    expect(krStep(kr(0, 0, 8, { unit: 'ч' }))).toBe(0.5)
    expect(krStep(kr(0, 0, 5, { unit: 'трен.' }))).toBe(1)
    expect(krStep(kr(0, 1.5, 5))).toBe(0.5)
  })

  it('cleans and pads review lines', () => {
    expect(cleanLines(['  a ', '', ' ', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c'])
    expect(padLines(['x'])).toEqual(['x', '', ''])
    expect(padLines(undefined)).toEqual(['', '', ''])
  })
})
