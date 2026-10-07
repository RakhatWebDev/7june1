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
