import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { DayType, Exercise, Program } from '../../db/types'
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

/** «3 трен./нед. · 12 нед. · круг из 6 тренировок» / «6 дн./нед.» */
export function programSubtitle(program: Program): string {
  if (program.schedule !== 'sequential') return `${program.daysPerWeek} дн./нед.`
  const parts = [`${program.sessionsPerWeek ?? program.daysPerWeek} трен./нед.`]
  if (program.weeks) parts.push(`${program.weeks} нед.`)
  parts.push(`круг из ${program.days.length} тренировок`)
  return parts.join(' · ')
}
