import { addDays, format } from 'date-fns'
import type { SleepEntry } from '../../db/types'
import { fromISODate, toISODate } from '../../lib/dates'

export const MAX_SLEEP_MIN = 16 * 60

/** Minutes between bedtime and wake time (handles crossing midnight since both carry a date). */
export function sleepDurationMin(bedtime: Date | string, wakeTime: Date | string): number {
  const b = typeof bedtime === 'string' ? new Date(bedtime) : bedtime
  const w = typeof wakeTime === 'string' ? new Date(wakeTime) : wakeTime
  return Math.round((w.getTime() - b.getTime()) / 60000)
}

/** Returns a Russian error message, or null when the interval is valid. */
export function validateSleep(bedtime: Date | null, wakeTime: Date | null): string | null {
  if (!bedtime || Number.isNaN(bedtime.getTime())) return 'Укажите время отбоя'
  if (!wakeTime || Number.isNaN(wakeTime.getTime())) return 'Укажите время подъёма'
  const min = sleepDurationMin(bedtime, wakeTime)
  if (min <= 0) return 'Подъём должен быть позже отбоя'
  if (min >= MAX_SLEEP_MIN) return 'Сон должен длиться меньше 16 часов'
  return null
}

/** Total minutes slept per wake-up date (several entries on one date, e.g. naps, are summed). */
export function minutesByDate(entries: SleepEntry[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) m.set(e.date, (m.get(e.date) ?? 0) + e.durationMin)
  return m
}

/**
 * Average nightly sleep over the `days` days ending at `refDate` (inclusive),
 * counting only days that have a record. Null when there are none.
 */
export function averageSleep(entries: SleepEntry[], refDate: string, days = 7): number | null {
  const from = toISODate(addDays(fromISODate(refDate), -(days - 1)))
  const byDate = minutesByDate(entries.filter((e) => e.date >= from && e.date <= refDate))
  if (byDate.size === 0) return null
  let sum = 0
  for (const v of byDate.values()) sum += v
  return Math.round(sum / byDate.size)
}

export interface SleepChartPoint {
  date: string
  /** dd.MM */
  label: string
  /** Hours slept, null when no record */
  hours: number | null
}

/** One point per day for the `days` days ending at `refDate`, oldest first. */
export function sleepChartData(entries: SleepEntry[], refDate: string, days = 14): SleepChartPoint[] {
  const byDate = minutesByDate(entries)
  const ref = fromISODate(refDate)
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(ref, i - (days - 1))
    const iso = toISODate(d)
    const min = byDate.get(iso)
    return { date: iso, label: format(d, 'dd.MM'), hours: min == null ? null : Number((min / 60).toFixed(2)) }
  })
}

/** Most recent entry by wake time. */
export function latestSleep(entries: SleepEntry[]): SleepEntry | undefined {
  let best: SleepEntry | undefined
  for (const e of entries) if (!best || e.wakeTime > best.wakeTime) best = e
  return best
}

/** Value for <input type="datetime-local">: "YYYY-MM-DDTHH:mm" in local time. */
export function toLocalInput(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

/** Parses "YYYY-MM-DDTHH:mm" as local time; null when empty/invalid. */
export function fromLocalInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s)
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  return Number.isNaN(d.getTime()) ? null : d
}

export const QUALITY_RU: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Ужасно',
  2: 'Плохо',
  3: 'Нормально',
  4: 'Хорошо',
  5: 'Отлично',
}
