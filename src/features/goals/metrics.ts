import { formatMinutes } from '../../lib/dates'

/** Which direction of change is an improvement for a weekly metric. */
export type Better = 'up' | 'down' | 'neutral'

export type MetricFormat = 'int' | 'kg' | 'km' | 'min' | 'duration' | 'ml' | 'pct' | 'score' | 'money' | 'kcal'

export interface MetricMeta {
  key: string
  label: string
  format: MetricFormat
  better: Better
}

/** Keys returned by `collectWeekStats`, in display order. */
export const METRICS: MetricMeta[] = [
  { key: 'workouts', label: 'Тренировки', format: 'int', better: 'up' },
  { key: 'workoutVolumeKg', label: 'Объём в зале', format: 'kg', better: 'up' },
  { key: 'cardioMin', label: 'Кардио', format: 'min', better: 'up' },
  { key: 'cardioKm', label: 'Дистанция', format: 'km', better: 'up' },
  { key: 'stretchMin', label: 'Растяжка', format: 'min', better: 'up' },
  { key: 'avgSleepMin', label: 'Сон в среднем', format: 'duration', better: 'up' },
  { key: 'sleepNights', label: 'Ночей со сном', format: 'int', better: 'up' },
  { key: 'avgKcal', label: 'Ккал в среднем', format: 'kcal', better: 'neutral' },
  { key: 'kcalTarget', label: 'Норма ккал', format: 'kcal', better: 'neutral' },
  { key: 'daysOnKcal', label: 'Дней в норме ккал', format: 'int', better: 'up' },
  { key: 'waterAvgMl', label: 'Вода в среднем', format: 'ml', better: 'up' },
  { key: 'habitsPct', label: 'Привычки', format: 'pct', better: 'up' },
  { key: 'pagesRead', label: 'Страниц прочитано', format: 'int', better: 'up' },
  { key: 'readingMin', label: 'Чтение', format: 'min', better: 'up' },
  { key: 'moodAvg', label: 'Настроение', format: 'score', better: 'up' },
  { key: 'mindMin', label: 'Практики', format: 'min', better: 'up' },
  { key: 'gratitudeDays', label: 'Дней благодарности', format: 'int', better: 'up' },
  { key: 'spent', label: 'Расходы', format: 'money', better: 'down' },
  { key: 'income', label: 'Доходы', format: 'money', better: 'up' },
  { key: 'budgetPct', label: 'Бюджет недели', format: 'pct', better: 'down' },
  { key: 'weightStart', label: 'Вес в начале', format: 'kg', better: 'neutral' },
  { key: 'weightEnd', label: 'Вес в конце', format: 'kg', better: 'neutral' },
  { key: 'calendarEvents', label: 'Занятий в календаре', format: 'int', better: 'up' },
]

export const METRIC_KEYS = METRICS.map((m) => m.key)

const CURRENCY_SIGN: Record<string, string> = { KZT: '₸', RUB: '₽', USD: '$', EUR: '€' }

export function currencySign(currency: unknown): string {
  return typeof currency === 'string' ? (CURRENCY_SIGN[currency] ?? currency) : '₸'
}

const num = (n: number, digits = 0) =>
  n.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

/** Human-readable value of a metric. Zero values render as a dash where "0" would mislead. */
export function formatMetric(format: MetricFormat, value: number, currency = '₸'): string {
  const v = Number.isFinite(value) ? value : 0
  switch (format) {
    case 'kg':
      return v === 0 ? '—' : `${num(v, 1)} кг`
    case 'km':
      return `${num(v, 1)} км`
    case 'min':
      return `${num(v)} мин`
    case 'duration':
      return v === 0 ? '—' : formatMinutes(v)
    case 'ml':
      return `${num(v)} мл`
    case 'pct':
      return `${num(v)}%`
    case 'score':
      return v === 0 ? '—' : num(v, 1)
    case 'money':
      return `${num(v)} ${currency}`
    case 'kcal':
      return v === 0 ? '—' : `${num(v)} ккал`
    default:
      return num(v)
  }
}

/** Signed absolute difference formatted in the metric's units, e.g. "+2", "−150 мин". */
export function formatDiff(format: MetricFormat, diff: number, currency = '₸'): string {
  if (diff === 0) return '0'
  const sign = diff > 0 ? '+' : '−'
  const abs = Math.abs(diff)
  const body =
    format === 'duration'
      ? formatMinutes(abs)
      : format === 'kg' || format === 'score' || format === 'kcal'
        ? formatMetric(format, abs, currency)
        : formatMetric(format, abs, currency)
  return `${sign}${body}`
}
