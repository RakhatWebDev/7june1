import { db } from '../../../db'
import type { Habit, ISODate } from '../../../db/types'
import { plural } from '../../../lib/format'
import { habitLogId } from './calc'

/** 24 emoji to choose a habit icon from. */
export const HABIT_EMOJI = [
  '🏋', '🏃', '💧', '🌙', '📖', '🧘', '🍬', '👟',
  '🥗', '🍎', '🚴', '🏊', '🧠', '✍️', '🎯', '💊',
  '🦷', '☀️', '🚭', '📵', '🧹', '💰', '🎸', '🙏',
]

export const COLOR_RU: Record<string, string> = {
  accent: 'Лайм',
  info: 'Синий',
  warn: 'Янтарный',
  danger: 'Красный',
  violet: 'Фиолетовый',
  pink: 'Розовый',
}

/** Write (or overwrite) the manual log for a habit on a day. */
export async function setHabitDone(habitId: string, date: ISODate, done: boolean): Promise<void> {
  await db.habitLogs.put({ id: habitLogId(habitId, date), habitId, date, done })
}

/** "5 дней" / "2 недели" depending on the habit frequency. */
export function streakLabel(habit: Pick<Habit, 'frequency'>, n: number): string {
  return habit.frequency === 'weekly'
    ? `${n} ${plural(n, ['неделя', 'недели', 'недель'])}`
    : `${n} ${plural(n, ['день', 'дня', 'дней'])}`
}

/**
 * Marks the all-habits-done celebration of `day` as shown; `true` if it had not been shown yet
 * (one confetti per day, shared by the dashboard card and the habits page).
 */
export function claimCelebration(day: ISODate): boolean {
  const key = `forma:habits-confetti:${day}`
  try {
    if (localStorage.getItem(key) === '1') return false
    localStorage.setItem(key, '1')
  } catch {
    /* storage unavailable — celebrate anyway */
  }
  return true
}
