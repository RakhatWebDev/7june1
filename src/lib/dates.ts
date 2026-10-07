import { format, parseISO, startOfWeek, addDays } from 'date-fns'

/** Local calendar day as YYYY-MM-DD */
export function toISODate(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd')
}

export function today(): string {
  return toISODate(new Date())
}

export function fromISODate(s: string): Date {
  return parseISO(s)
}

/** Monday-based ISO weekday: 0 = Monday … 6 = Sunday */
export function weekdayIndex(d: Date = new Date()): number {
  return (d.getDay() + 6) % 7
}

/** The 7 ISO dates of the week containing `d`, Monday first */
export function weekDates(d: Date = new Date()): string[] {
  const start = startOfWeek(d, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)))
}

export const WEEKDAY_SHORT_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const WEEKDAY_RU = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
]

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} мин`
  return `${h} ч ${m.toString().padStart(2, '0')} мин`
}
