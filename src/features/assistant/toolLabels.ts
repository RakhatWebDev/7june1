import type { IconName } from '../../components/icons'

/** Russian label + icon for each coach tool, shown in the «что тренер посмотрел» cards. */
const TOOL_META: Record<string, { label: string; icon: IconName }> = {
  get_profile_and_targets: { label: 'Профиль и нормы', icon: 'user' },
  get_todays_plan: { label: 'План на сегодня', icon: 'calendar' },
  get_recent_workouts: { label: 'Последние тренировки', icon: 'dumbbell' },
  get_exercise_history: { label: 'История упражнения', icon: 'history' },
  get_nutrition_summary: { label: 'Питание', icon: 'utensils' },
  get_sleep_summary: { label: 'Сон', icon: 'moon' },
  get_weight_trend: { label: 'Динамика веса', icon: 'scale' },
  get_activities: { label: 'Кардио и активность', icon: 'run' },
  get_habits_status: { label: 'Привычки', icon: 'check' },
  get_mood_and_mind: { label: 'Настроение и стресс', icon: 'brain' },
  get_week_stats: { label: 'Статистика недели', icon: 'chart' },
  get_upcoming_events: { label: 'Ближайшие события', icon: 'calendar' },
  log_food_entry: { label: 'Запись еды', icon: 'utensils' },
  log_weight: { label: 'Запись веса', icon: 'scale' },
  log_activity: { label: 'Запись активности', icon: 'activity' },
  add_note_to_next_session: { label: 'Заметка к тренировке', icon: 'edit' },
  save_program: { label: 'Сохранение программы', icon: 'list' },
}

export function toolMeta(name: string): { label: string; icon: IconName } {
  return TOOL_META[name] ?? { label: name.replace(/_/g, ' '), icon: 'sparkles' }
}

const MEAL_RU: Record<string, string> = {
  breakfast: 'завтрак',
  lunch: 'обед',
  dinner: 'ужин',
  snack: 'перекус',
}

const ACTIVITY_RU: Record<string, string> = {
  run: 'бег',
  bike: 'велосипед',
  swim: 'плавание',
  rope: 'скакалка',
  walk: 'ходьба',
  stretch: 'растяжка',
  hiit: 'HIIT',
  other: 'активность',
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))

/** One-line Russian summary of what a mutating tool is about to write. */
export function describeMutation(name: string, input: Record<string, unknown>): string {
  const i = input
  switch (name) {
    case 'log_food_entry': {
      const parts = [String(i.name ?? i.food ?? 'Еда')]
      const g = num(i.grams)
      if (g != null) parts.push(`${fmt(g)} г`)
      const kcal = num(i.kcal)
      if (kcal != null) parts.push(`${Math.round(kcal)} ккал`)
      const macros = [
        ['Б', num(i.proteinG)],
        ['Ж', num(i.fatG)],
        ['У', num(i.carbsG)],
      ].filter(([, v]) => v != null) as [string, number][]
      if (macros.length) parts.push(macros.map(([k, v]) => `${k} ${fmt(v)}`).join(' · '))
      const meal = typeof i.meal === 'string' ? MEAL_RU[i.meal] : undefined
      return parts.join(', ') + (meal ? ` (${meal})` : '')
    }
    case 'log_weight': {
      const w = num(i.weightKg ?? i.weight)
      return w != null ? `Вес ${fmt(w)} кг${i.date ? ` на ${String(i.date)}` : ''}` : 'Вес'
    }
    case 'log_activity': {
      const type = typeof i.type === 'string' ? (ACTIVITY_RU[i.type] ?? i.type) : 'активность'
      const parts = [type.charAt(0).toUpperCase() + type.slice(1)]
      const min = num(i.durationMin)
      if (min != null) parts.push(`${fmt(min)} мин`)
      const km = num(i.distanceKm)
      if (km != null) parts.push(`${fmt(km)} км`)
      return parts.join(', ')
    }
    case 'add_note_to_next_session':
      return `«${String(i.note ?? '')}»${i.exerciseId ? ` — ${String(i.exerciseName ?? i.exerciseId).replace(/_/g, ' ')}` : ''}`
    case 'save_program': {
      const p = (i.program && typeof i.program === 'object' ? i.program : i) as Record<string, unknown>
      const days = Array.isArray(p.days) ? p.days.length : undefined
      return `Программа «${String(p.name ?? 'Новая программа')}»${days ? `, ${days} дн.` : ''}`
    }
    default:
      return Object.entries(i)
        .slice(0, 4)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join(', ')
  }
}
