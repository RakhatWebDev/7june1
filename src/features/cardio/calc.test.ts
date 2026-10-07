import { describe, expect, it } from 'vitest'
import type { Activity } from '../../db/types'
import { estimateKcal, formatPace, formatPaceValue, MET, pace, pickWeight, summarize } from './calc'

describe('estimateKcal', () => {
  it('uses MET × kg × hours', () => {
    // 9.8 × 80 × 0.5 = 392
    expect(estimateKcal('run', 30, 80)).toBe(392)
    // 7.5 × 88 × 1 = 660
    expect(estimateKcal('bike', 60, 88)).toBe(660)
    // 2.5 × 70 × 0.25 = 43.75 → 44
    expect(estimateKcal('stretch', 15, 70)).toBe(44)
  })
  it('covers all MET values from the spec', () => {
    expect(MET).toEqual({ run: 9.8, bike: 7.5, swim: 8, rope: 11, walk: 3.5, stretch: 2.5, hiit: 10, other: 5 })
  })
  it('returns null without duration or weight', () => {
    expect(estimateKcal('run', 0, 80)).toBeNull()
    expect(estimateKcal('run', 30, null)).toBeNull()
  })
})

describe('pace', () => {
  it('computes min/km for running', () => {
    const p = pace('run', 27.5, 5)
    expect(p).toEqual({ minPerUnit: 5.5, unit: 'км' })
    expect(formatPace(p!)).toBe('5:30 мин/км')
  })
  it('computes min/100 m for swimming', () => {
    // 1 km in 20 min → 2:00 per 100 m
    const p = pace('swim', 20, 1)
    expect(p?.unit).toBe('100 м')
    expect(p?.minPerUnit).toBeCloseTo(2)
    expect(formatPace(p!)).toBe('2:00 мин/100 м')
  })
  it('is null for other types or missing distance', () => {
    expect(pace('bike', 60, 30)).toBeNull()
    expect(pace('run', 30, 0)).toBeNull()
    expect(pace('run', 30, undefined)).toBeNull()
  })
  it('formats seconds with rounding and padding', () => {
    expect(formatPaceValue(4.999)).toBe('5:00')
    expect(formatPaceValue(6.1)).toBe('6:06')
  })
})

describe('summarize', () => {
  const a = (p: Partial<Activity>): Activity => ({ id: Math.random().toString(), type: 'run', date: '2026-10-06', durationMin: 30, ...p })
  it('aggregates minutes, km and counts by type within the range', () => {
    const s = summarize(
      [
        a({ distanceKm: 5, kcal: 300 }),
        a({ type: 'swim', durationMin: 40, distanceKm: 1.5 }),
        a({ type: 'run', durationMin: 20, distanceKm: 3.2, date: '2026-10-11' }),
        a({ date: '2026-10-04' }), // previous week — excluded
      ],
      '2026-10-05',
      '2026-10-11',
    )
    expect(s.count).toBe(3)
    expect(s.minutes).toBe(90)
    expect(s.km).toBe(9.7)
    expect(s.kcal).toBe(300)
    expect(s.byType.run).toEqual({ count: 2, minutes: 50, km: 8.2 })
    expect(s.byType.swim?.count).toBe(1)
    expect(s.byType.bike).toBeUndefined()
  })
})

describe('pickWeight', () => {
  it('prefers the latest logged weight, then the profile', () => {
    expect(pickWeight(85, 88)).toBe(85)
    expect(pickWeight(undefined, 88)).toBe(88)
    expect(pickWeight(undefined, undefined)).toBeNull()
  })
})
