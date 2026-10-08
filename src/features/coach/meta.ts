import type { IconName } from '../../components/icons'
import type { Tone } from '../../components/ui'
import type { InsightKind } from './insights'
import type { ProgressionAction } from './progression'

/** Display metadata of insight categories (Russian labels, domain tones). */
export const KIND_META: Record<InsightKind, { label: string; icon: IconName; tone: Tone }> = {
  training: { label: 'Тренировки', icon: 'dumbbell', tone: 'accent' },
  recovery: { label: 'Восстановление', icon: 'wind', tone: 'violet' },
  sleep: { label: 'Сон', icon: 'moon', tone: 'violet' },
  nutrition: { label: 'Питание', icon: 'utensils', tone: 'warn' },
  weight: { label: 'Вес', icon: 'scale', tone: 'warn' },
  cardio: { label: 'Кардио', icon: 'run', tone: 'info' },
  habits: { label: 'Привычки', icon: 'check', tone: 'pink' },
  motivation: { label: 'Мотивация', icon: 'trophy', tone: 'amber' },
}

export const KIND_ORDER: InsightKind[] = ['training', 'recovery', 'sleep', 'nutrition', 'weight', 'cardio', 'habits', 'motivation']

export const ADVICE_TONE: Record<ProgressionAction, Tone> = {
  increase: 'accent',
  hold: 'muted',
  repeat: 'warn',
  decrease: 'danger',
}

export const ADVICE_ICON: Record<ProgressionAction, IconName> = {
  increase: 'arrow-up',
  hold: 'target',
  repeat: 'history',
  decrease: 'arrow-down',
}
