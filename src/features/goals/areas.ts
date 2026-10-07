import type { LifeArea } from '../../db/types'

export interface AreaMeta {
  id: LifeArea
  /** Russian display name */
  name: string
  /** Short label for the balance wheel axis */
  short: string
  icon: string
  /** CSS colour (design token with a literal fallback for tokens that may not exist yet) */
  color: string
}

/** Life areas in the order they appear on the balance wheel and in lists. */
export const LIFE_AREAS: AreaMeta[] = [
  { id: 'body', name: 'Тело', short: 'Тело', icon: '💪', color: 'var(--color-accent)' },
  { id: 'mind', name: 'Разум', short: 'Разум', icon: '🧠', color: 'var(--color-info)' },
  { id: 'finance', name: 'Финансы', short: 'Финансы', icon: '💰', color: 'var(--color-warn)' },
  { id: 'career', name: 'Карьера', short: 'Карьера', icon: '💼', color: 'var(--color-info)' },
  { id: 'relationships', name: 'Отношения', short: 'Отношения', icon: '❤️', color: 'var(--color-pink, #f472b6)' },
  { id: 'spirit', name: 'Дух', short: 'Дух', icon: '🕊', color: 'var(--color-violet, #a78bfa)' },
  { id: 'learning', name: 'Обучение', short: 'Обучение', icon: '📚', color: 'var(--color-warn)' },
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
