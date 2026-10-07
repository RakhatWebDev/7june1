import { describe, expect, it } from 'vitest'
import type { SleepEntry } from '../../db/types'
import {
  averageSleep,
  fromLocalInput,
  latestSleep,
  sleepChartData,
  sleepDurationMin,
  toLocalInput,
  validateSleep,
} from './calc'

const entry = (date: string, durationMin: number, wake = `${date}T07:00:00.000Z`): SleepEntry => ({
  id: `${date}-${durationMin}`,
  date,
  bedtime: '2026-01-01T00:00:00.000Z',
  wakeTime: wake,
  durationMin,
  quality: 3,
})

describe('sleepDurationMin', () => {
  it('handles crossing midnight', () => {
    expect(sleepDurationMin(new Date(2026, 9, 6, 23, 30), new Date(2026, 9, 7, 7, 15))).toBe(465)
  })
  it('works with ISO strings', () => {
    expect(sleepDurationMin('2026-10-06T22:00:00.000Z', '2026-10-07T06:00:00.000Z')).toBe(480)
  })
})

describe('validateSleep', () => {
  it('requires wake time after bedtime', () => {
    expect(validateSleep(new Date(2026, 9, 7, 7), new Date(2026, 9, 7, 6))).toMatch(/позже отбоя/)
    expect(validateSleep(new Date(2026, 9, 7, 7), new Date(2026, 9, 7, 7))).toMatch(/позже отбоя/)
  })
  it('rejects 16 hours or more', () => {
    expect(validateSleep(new Date(2026, 9, 6, 12), new Date(2026, 9, 7, 4))).toMatch(/16/)
    expect(validateSleep(new Date(2026, 9, 6, 12, 1), new Date(2026, 9, 7, 4))).toBeNull()
  })
  it('requires both times', () => {
    expect(validateSleep(null, new Date())).toMatch(/отбоя/)
  })
})

describe('averageSleep', () => {
  it('averages the last 7 days inclusive, ignoring older entries and empty days', () => {
    const entries = [
      entry('2026-10-07', 420),
      entry('2026-10-05', 480),
      entry('2026-10-01', 540), // 7th day back (inclusive window 10-01..10-07)
      entry('2026-09-30', 60), // outside
    ]
    expect(averageSleep(entries, '2026-10-07')).toBe(480)
  })
  it('sums naps on the same date', () => {
    expect(averageSleep([entry('2026-10-07', 400), entry('2026-10-07', 40)], '2026-10-07')).toBe(440)
  })
  it('returns null with no data', () => {
    expect(averageSleep([entry('2026-09-01', 400)], '2026-10-07')).toBeNull()
  })
})

describe('sleepChartData', () => {
  it('returns 14 days oldest first with hours or null', () => {
    const data = sleepChartData([entry('2026-10-07', 450), entry('2026-09-24', 480)], '2026-10-07')
    expect(data).toHaveLength(14)
    expect(data[0]).toEqual({ date: '2026-09-24', label: '24.09', hours: 8 })
    expect(data[13]).toEqual({ date: '2026-10-07', label: '07.10', hours: 7.5 })
    expect(data[5].hours).toBeNull()
  })
})

describe('helpers', () => {
  it('latestSleep picks the latest wake time', () => {
    expect(latestSleep([entry('2026-10-05', 1), entry('2026-10-07', 2), entry('2026-10-06', 3)])?.durationMin).toBe(2)
  })
  it('round-trips datetime-local values in local time', () => {
    const d = new Date(2026, 9, 7, 6, 45)
    expect(toLocalInput(d)).toBe('2026-10-07T06:45')
    expect(fromLocalInput('2026-10-07T06:45')?.getTime()).toBe(d.getTime())
    expect(fromLocalInput('')).toBeNull()
  })
})
