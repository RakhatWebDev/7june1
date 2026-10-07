import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { CalendarEvent } from '../../db/types'
import { toISODate } from '../../lib/dates'

export type EventKind = CalendarEvent['kind']

export const KIND_META: Record<EventKind, { label: string; icon: string }> = {
  gym: { label: 'Зал', icon: '🏋' },
  class: { label: 'Занятия', icon: '🧘' },
  swim: { label: 'Бассейн', icon: '🏊' },
  run: { label: 'Бег', icon: '🏃' },
  bike: { label: 'Вело', icon: '🚴' },
  other: { label: 'Другое', icon: '📅' },
}

export const KIND_ORDER: EventKind[] = ['gym', 'class', 'swim', 'run', 'bike', 'other']

/** Where an event's action button leads: start a gym workout or log a cardio activity. */
export function actionFor(kind: EventKind): { to: string; label: string } | null {
  switch (kind) {
    case 'gym':
      return { to: '/workouts', label: 'Начать тренировку' }
    case 'swim':
    case 'run':
    case 'bike':
      return { to: `/cardio/new?type=${kind}`, label: 'Записать активность' }
    case 'class':
      return { to: '/cardio/new?type=other', label: 'Записать активность' }
    default:
      return null
  }
}

const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/**
 * Short relative label for an upcoming event: «сегодня 18:30», «завтра 07:00», «пт 19:00».
 * Further than a week away: «12 окт 19:00». All-day events omit the time.
 */
export function relativeLabel(startAt: string, allDay: boolean, now: Date = new Date()): string {
  const d = parseISO(startAt)
  const diff = differenceInCalendarDays(d, now)
  let day: string
  if (diff === 0) day = 'сегодня'
  else if (diff === 1) day = 'завтра'
  else if (diff === -1) day = 'вчера'
  else if (diff > 1 && diff < 7) day = WEEKDAY_SHORT[d.getDay()]
  else day = format(d, 'd MMM', { locale: ru }).replace('.', '')
  return allDay ? `${day}, весь день` : `${day} ${format(d, 'HH:mm')}`
}

/** Day heading for grouped lists: «Сегодня, 8 октября», «Пятница, 10 октября». */
export function dayHeading(dayKey: string, now: Date = new Date()): string {
  const d = parseISO(dayKey)
  const diff = differenceInCalendarDays(d, now)
  const date = format(d, 'd MMMM', { locale: ru })
  const name =
    diff === 0
      ? 'Сегодня'
      : diff === 1
        ? 'Завтра'
        : diff === -1
          ? 'Вчера'
          : format(d, 'EEEE', { locale: ru }).replace(/^./, (c) => c.toUpperCase())
  return `${name}, ${date}`
}

/** «18:30–19:30», or «весь день» (multi-day all-day events show the end date). */
export function timeRange(ev: Pick<CalendarEvent, 'startAt' | 'endAt' | 'allDay'>): string {
  const s = parseISO(ev.startAt)
  const e = parseISO(ev.endAt)
  if (ev.allDay) {
    const days = differenceInCalendarDays(e, s)
    return days > 1
      ? `весь день, до ${format(addDays(e, -1), 'd MMM', { locale: ru }).replace('.', '')}`
      : 'весь день'
  }
  const from = format(s, 'HH:mm')
  return e.getTime() > s.getTime() ? `${from}–${format(e, 'HH:mm')}` : from
}

/** Groups events by local start day, preserving the input order inside each group. */
export function groupByDay(events: CalendarEvent[]): [string, CalendarEvent[]][] {
  const groups = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    const key = toISODate(parseISO(ev.startAt))
    const list = groups.get(key)
    if (list) list.push(ev)
    else groups.set(key, [ev])
  }
  return [...groups.entries()]
}

/** Events that have not ended yet and start within `days` days from `now`, soonest first. */
export function upcomingEvents(events: CalendarEvent[], now: Date, days: number): CalendarEvent[] {
  const nowIso = now.toISOString()
  const until = new Date(now.getTime() + days * 86_400_000).toISOString()
  return events
    .filter((e) => (e.endAt > nowIso || e.startAt >= nowIso) && e.startAt < until)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
}

/** Events that ended within the last `days` days, most recent first. */
export function pastEvents(events: CalendarEvent[], now: Date, days: number): CalendarEvent[] {
  const nowIso = now.toISOString()
  const from = new Date(now.getTime() - days * 86_400_000).toISOString()
  return events
    .filter((e) => e.endAt <= nowIso && e.startAt < nowIso && e.startAt >= from)
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
}
