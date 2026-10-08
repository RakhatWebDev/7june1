import type { Goal } from '../../db/types'
import { formatMinutes } from '../../lib/dates'
import { int, plural } from '../../lib/format'
import { fmtKg, round } from './util'

/* WeekNarrativeCard text: 3–5 plain sentences from collectWeekStats, no AI. */

export interface NarrativeInput {
  stats: Record<string, number>
  previous: Record<string, number>
  goal?: Goal | null
  sleepTargetMin?: number
  targetPerWeek?: number
}

const signed = (n: number, unit = '') => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${int(Math.abs(n))}${unit}`
const changePct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null)

export function weekNarrative({ stats: s, previous: p, goal, sleepTargetMin = 480, targetPerWeek = 3 }: NarrativeInput): string[] {
  const out: string[] = []
  const v = (k: string) => s[k] ?? 0
  const pv = (k: string) => p[k] ?? 0

  /* training */
  const w = v('workouts')
  if (w > 0) {
    const pct = changePct(v('workoutVolumeKg'), pv('workoutVolumeKg'))
    const vol = v('workoutVolumeKg') > 0 ? ` и ${int(v('workoutVolumeKg'))} кг объёма` : ''
    const cmp =
      pct == null
        ? ''
        : pct >= 3
          ? ` — на ${pct} % больше, чем неделей раньше`
          : pct <= -3
            ? ` — на ${-pct} % меньше, чем неделей раньше`
            : ' — на уровне прошлой недели'
    const plan = w >= targetPerWeek ? ` План ${targetPerWeek} из ${targetPerWeek} выполнен.` : ` До плана не хватило ${targetPerWeek - w}.`
    out.push(`${w} ${plural(w, ['тренировка', 'тренировки', 'тренировок'])}${vol}${cmp}.${plan}`)
  } else if (pv('workouts') > 0) {
    out.push(`Силовых на этой неделе не было, хотя неделей раньше было ${pv('workouts')} — начни следующую с самого любимого дня программы.`)
  }

  /* weight */
  if (v('weightStart') > 0 && v('weightEnd') > 0 && v('weightStart') !== v('weightEnd')) {
    const d = round(v('weightEnd') - v('weightStart'), 1)
    const good = goal === 'cut' ? d < 0 : goal === 'lean_bulk' ? d > 0 : Math.abs(d) <= 0.5
    out.push(
      `Вес: ${fmtKg(v('weightStart'))} → ${fmtKg(v('weightEnd'))} кг (${d > 0 ? '+' : '−'}${fmtKg(Math.abs(d))})${goal && goal !== 'maintain' ? (good ? ' — в сторону цели' : ' — пока против цели') : ''}.`,
    )
  }

  /* nutrition */
  if (v('avgKcal') > 0 && v('kcalTarget') > 0) {
    const diff = v('avgKcal') - v('kcalTarget')
    const near = Math.abs(diff) <= v('kcalTarget') * 0.1
    out.push(
      `Калории: в среднем ${int(v('avgKcal'))} ккал при норме ${int(v('kcalTarget'))}${near ? ' — в коридоре' : ` (${signed(diff)})`}, в норме ${v('daysOnKcal')} ${plural(v('daysOnKcal'), ['день', 'дня', 'дней'])}.`,
    )
  }

  /* sleep */
  if (v('sleepNights') > 0 && v('avgSleepMin') > 0) {
    const gap = v('avgSleepMin') - sleepTargetMin
    const trend = pv('avgSleepMin') > 0 ? v('avgSleepMin') - pv('avgSleepMin') : null
    out.push(
      `Сон в среднем ${formatMinutes(v('avgSleepMin'))}${gap >= 0 ? ' — норма выполнена' : ` — на ${formatMinutes(-gap)} меньше цели`}${trend != null && Math.abs(trend) >= 15 ? `, ${trend > 0 ? 'лучше' : 'хуже'} прошлой недели` : ''}.`,
    )
  }

  /* cardio */
  if (v('cardioMin') > 0 || pv('cardioMin') > 0) {
    const d = v('cardioMin') - pv('cardioMin')
    out.push(
      v('cardioMin') > 0
        ? `Кардио — ${int(v('cardioMin'))} мин${v('cardioKm') > 0 ? `, ${String(v('cardioKm')).replace('.', ',')} км` : ''} (${signed(d, ' мин')} к прошлой неделе).`
        : `Кардио на этой неделе не было${goal === 'cut' ? ' — на сушке добавь хотя бы две прогулки или бассейн' : ''}.`,
    )
  } else if (goal === 'cut') {
    out.push('Кардио пока нет — на сушке две прогулки или бассейн в неделю заметно ускорят результат.')
  }

  /* habits & mood */
  if (v('habitsPct') > 0) {
    const d = v('habitsPct') - pv('habitsPct')
    out.push(`Привычки выполнены на ${v('habitsPct')} %${pv('habitsPct') > 0 && Math.abs(d) >= 5 ? ` (${signed(d, ' п.п.')})` : ''}.`)
  }
  if (v('moodAvg') > 0) {
    out.push(`Среднее настроение — ${String(v('moodAvg')).replace('.', ',')} из 5.`)
  }

  if (out.length < 3) {
    out.push('Данных пока немного — отмечай тренировки, еду и сон, и разбор недели станет точнее.')
  }
  return out.slice(0, 5)
}
