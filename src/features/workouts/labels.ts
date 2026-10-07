import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { DayType, Exercise } from '../../db/types'
import { formatClock } from './calc'

export const DAY_TYPE_RU: Record<DayType, string> = {
  push: 'Жим',
  pull: 'Тяга',
  legs: 'Ноги',
  upper: 'Верх',
  lower: 'Низ',
  full: 'Всё тело',
  arms: 'Руки',
  rest: 'Отдых',
}

export const LEVEL_RU: Record<Exercise['level'], string> = {
  beginner: 'Новичок',
  intermediate: 'Средний',
  expert: 'Продвинутый',
}

export const MECHANIC_RU: Record<NonNullable<Exercise['mechanic']>, string> = {
  compound: 'Базовое',
  isolation: 'Изолирующее',
}

export const FORCE_RU: Record<NonNullable<Exercise['force']>, string> = {
  push: 'Жим',
  pull: 'Тяга',
  static: 'Статика',
}

/** "отдых 2:00" */
export function restLabel(sec: number | undefined): string | null {
  return sec ? `отдых ${formatClock(sec)}` : null
}

/** "ср, 7 октября" */
export function formatSessionDate(iso: string): string {
  return format(parseISO(iso), 'EEEEEE, d MMMM', { locale: ru })
}

/** "7 окт. 2026, 18:30" */
export function formatSessionDateTime(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy, HH:mm', { locale: ru })
}
