import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../../db/types'
import {
  actionFor,
  dayHeading,
  groupByDay,
  pastEvents,
  relativeLabel,
  timeRange,
  upcomingEvents,
} from './meta'

// Wednesday 7 Oct 2026, 12:00 local
const NOW = new Date(2026, 9, 7, 12, 0)
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString()

function mk(
  id: string,
  start: string,
  end: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    title: id,
    startAt: start,
    endAt: end,
    allDay: false,
    source: 's',
    kind: 'gym',
    importedAt: start,
    ...extra,
  }
}

describe('relativeLabel', () => {
  it('uses сегодня / завтра / weekday / date', () => {
    expect(relativeLabel(at(7, 18, 30), false, NOW)).toBe('сегодня 18:30')
    expect(relativeLabel(at(8, 7), false, NOW)).toBe('завтра 07:00')
    expect(relativeLabel(at(9, 19), false, NOW)).toBe('пт 19:00')
    expect(relativeLabel(at(13, 9), false, NOW)).toBe('вт 09:00')
    expect(relativeLabel(at(20, 9), false, NOW)).toBe('20 окт 09:00')
    expect(relativeLabel(at(8, 0), true, NOW)).toBe('завтра, весь день')
  })
})

describe('dayHeading and timeRange', () => {
  it('formats headings in Russian', () => {
    expect(dayHeading('2026-10-07', NOW)).toBe('Сегодня, 7 октября')
    expect(dayHeading('2026-10-08', NOW)).toBe('Завтра, 8 октября')
    expect(dayHeading('2026-10-06', NOW)).toBe('Вчера, 6 октября')
    expect(dayHeading('2026-10-09', NOW)).toBe('Пятница, 9 октября')
  })

  it('formats time ranges', () => {
    expect(timeRange({ startAt: at(7, 18, 30), endAt: at(7, 19, 30), allDay: false })).toBe(
      '18:30–19:30',
    )
    expect(timeRange({ startAt: at(7, 18, 30), endAt: at(7, 18, 30), allDay: false })).toBe('18:30')
    expect(timeRange({ startAt: at(7, 0), endAt: at(8, 0), allDay: true })).toBe('весь день')
    expect(timeRange({ startAt: at(7, 0), endAt: at(10, 0), allDay: true })).toBe(
      'весь день, до 9 окт',
    )
  })
})

describe('upcoming / past windows', () => {
  const events = [
    mk('past-old', at(-1, 9), at(-1, 10)),
    mk('past', at(6, 9), at(6, 10)),
    mk('running-now', at(7, 11, 30), at(7, 12, 30)),
    mk('later-today', at(7, 18), at(7, 19)),
    mk('in-10-days', at(17, 9), at(17, 10)),
    mk('in-20-days', at(27, 9), at(27, 10)),
  ]

  it('upcoming includes in-progress events and respects the day limit', () => {
    expect(upcomingEvents(events, NOW, 14).map((e) => e.id)).toEqual([
      'running-now',
      'later-today',
      'in-10-days',
    ])
    expect(upcomingEvents(events, NOW, 7).map((e) => e.id)).toEqual(['running-now', 'later-today'])
  })

  it('past lists the last 7 days, newest first', () => {
    expect(pastEvents(events, NOW, 7).map((e) => e.id)).toEqual(['past'])
  })

  it('groups by local day', () => {
    const groups = groupByDay(upcomingEvents(events, NOW, 14))
    expect(groups.map(([d, l]) => [d, l.length])).toEqual([
      ['2026-10-07', 2],
      ['2026-10-17', 1],
    ])
  })
})

describe('actionFor', () => {
  it('maps kinds to workout / cardio links', () => {
    expect(actionFor('gym')).toEqual({ to: '/workouts', label: 'Начать тренировку' })
    expect(actionFor('swim')?.to).toBe('/cardio/new?type=swim')
    expect(actionFor('run')?.to).toBe('/cardio/new?type=run')
    expect(actionFor('bike')?.to).toBe('/cardio/new?type=bike')
    expect(actionFor('class')).toEqual({
      to: '/cardio/new?type=other',
      label: 'Записать активность',
    })
    expect(actionFor('other')).toBeNull()
  })
})
