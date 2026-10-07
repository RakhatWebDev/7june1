import type { IconName } from '../../components/icons'
import { TONE_VAR, type Tone } from '../../components/ui/helpers'
import type { LifeArea } from '../../db/types'

export interface AreaMeta {
  id: LifeArea
  /** Russian display name */
  name: string
  /** Short label for the balance wheel axis */
  short: string
  /** Emoji (legacy, kept for data/back-compat; the UI uses `iconName`) */
  icon: string
  /** Line icon of the area in the UI */
  iconName: IconName
  /** Domain tone (icon badge, progress, tiles) */
  tone: Tone
  /** CSS colour of `tone` */
  color: string
}

const area = (id: LifeArea, name: string, icon: string, iconName: IconName, tone: Tone): AreaMeta => ({
  id,
  name,
  short: name,
  icon,
  iconName,
  tone,
  color: TONE_VAR[tone],
})

/** Life areas in the order they appear on the balance wheel and in lists. */
export const LIFE_AREAS: AreaMeta[] = [
  area('body', 'Тело', '💪', 'dumbbell', 'accent'),
  area('mind', 'Разум', '🧠', 'brain', 'violet'),
  area('finance', 'Финансы', '💰', 'wallet', 'amber'),
  area('career', 'Карьера', '💼', 'target', 'info'),
  area('relationships', 'Отношения', '❤️', 'heart', 'pink'),
  area('spirit', 'Дух', '🕊', 'sparkles', 'warn'),
  area('learning', 'Обучение', '📚', 'book', 'info'),
]

export const AREA_BY_ID: Record<LifeArea, AreaMeta> = Object.fromEntries(
  LIFE_AREAS.map((a) => [a.id, a]),
) as Record<LifeArea, AreaMeta>

export function areaMeta(id: LifeArea): AreaMeta {
  return AREA_BY_ID[id] ?? LIFE_AREAS[0]
}

export const GOAL_STATUS_RU: Record<'active' | 'done' | 'paused' | 'dropped', string> = {
  active: 'Активна',
  paused: 'На паузе',
  done: 'Достигнута',
  dropped: 'Брошена',
}
