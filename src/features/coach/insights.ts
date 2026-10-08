import type { FormaDB } from '../../db'
import type {
  Activity,
  Food,
  FoodEntry,
  Habit,
  ISODate,
  MoodEntry,
  Profile,
  Program,
  ProgramDay,
  SleepEntry,
  WaterEntry,
  WeightEntry,
  WorkoutSession,
} from '../../db/types'
import { formatMinutes, toISODate, weekDates, weekdayIndex } from '../../lib/dates'
import { plural } from '../../lib/format'
import type { Targets } from '../nutrition/calc'
import { programExerciseFor } from '../workouts/autoreg'
import {
  adviceLabel,
  adviseNext,
  asKgRecord,
  asTmLog,
  MAXES_KEY,
  previousEntry,
  TRAINING_MAX_LOG_KEY,
  TRAINING_MAXES_KEY,
  type LiftContext,
  type ProgressionAdvice,
} from './progression'
import { DEFAULT_WATER_TARGET_ML, habitDoneIndex, summarizeProfile } from './summary'
import {
  avg,
  bestSet,
  daysBetween,
  e1rm,
  fmtKg,
  localDay,
  round,
  sessionVolumeKg,
  shiftDate,
  sum,
  windowStart,
  workSets,
} from './util'

/* ------------------------------------------------------------------ */
/* Rule-based insights. Every rule is a pure function of `CoachData`.  */
/* ------------------------------------------------------------------ */

export type InsightKind = 'training' | 'nutrition' | 'sleep' | 'recovery' | 'habits' | 'weight' | 'cardio' | 'motivation'

export interface Insight {
  /** Stable within a day; used to dismiss */
  id: string
  kind: InsightKind
  /** 1 = most important */
  priority: 1 | 2 | 3
  title: string
  body: string
  action?: { label: string; to: string }
  /** "Why": the data points behind the advice (Russian) */
  evidence: string[]
  /** Rule that produced it */
  rule: RuleId
}

export type RuleId =
  | 'progression'
  | 'sleep_volume'
  | 'nutrition'
  | 'weight_plateau'
  | 'cardio'
  | 'deload'
  | 'frequency'
  | 'habits_streak'
  | 'water'
  | 'records'
  | 'stress'

/** Snapshot of everything the rules look at. Lists are pre-filtered to the windows noted. */
export interface CoachData {
  now: Date
  today: ISODate
  hour: number
  profile: Profile | null
  targets: Targets | null
  program: Program | null
  /** Program day to do today: next rotation day (sequential programs) or the weekday's day (may be rest) */
  todayDay: ProgramDay | null
  /** Active program rotates its days regardless of the weekday */
  sequential: boolean
  /** «Неделя 3 из 12 · тренировка 2 из 3» */
  scheduleLabel?: string
  /** Weekly training target (settings 'training.targetPerWeek', default 3) */
  targetPerWeek: number
  /** All finished sessions, newest first */
  sessions: WorkoutSession[]
  /** Last 28 days */
  activities: Activity[]
  /** Last 14 days */
  foodEntries: FoodEntry[]
  /** User food library (protein examples) */
  foods: Food[]
  /** Last 7 days */
  water: WaterEntry[]
  /** Last 28 days, oldest first */
  weights: WeightEntry[]
  /** Last 14 nights */
  sleep: SleepEntry[]
  /** Last 7 days */
  moods: MoodEntry[]
  /** Tested / training maxes for %-based lifts (auto-regulation) */
  lifts: LiftContext
  /** Active habits and their done days over the last 60 days */
  habits: Habit[]
  habitDone: Map<string, Set<ISODate>>
}

export const TARGET_PER_WEEK_KEY = 'training.targetPerWeek'
export const DEFAULT_TARGET_PER_WEEK = 3

export async function loadCoachData(db: FormaDB, now: Date = new Date()): Promise<CoachData> {
  const today = toISODate(now)
  const from = (n: number) => windowStart(today, n)
  const [summary, sessions, activities, foodEntries, foods, water, weights, sleep, moods, habitIdx, perWeek, maxes, tms, tmLog] = await Promise.all([
    summarizeProfile(db, now),
    db.sessions.toArray(),
    db.activities.where('date').between(from(28), today, true, true).toArray(),
    db.foodEntries.where('date').between(from(14), today, true, true).toArray(),
    db.foods.toArray(),
    db.water.where('date').between(from(7), today, true, true).toArray(),
    db.weights.where('date').between(from(28), today, true, true).sortBy('date'),
    db.sleep.where('date').between(from(14), today, true, true).toArray(),
    db.moods.where('date').between(from(7), today, true, true).toArray(),
    habitDoneIndex(db, from(60), today),
    db.settings.get(TARGET_PER_WEEK_KEY),
    db.settings.get(MAXES_KEY),
    db.settings.get(TRAINING_MAXES_KEY),
    db.settings.get(TRAINING_MAX_LOG_KEY),
  ])
  return {
    now,
    today,
    hour: now.getHours(),
    profile: summary.profile,
    targets: summary.targets,
    program: summary.activeProgram,
    todayDay: summary.todayDay,
    sequential: summary.sequential,
    ...(summary.scheduleLabel ? { scheduleLabel: summary.scheduleLabel } : {}),
    targetPerWeek: typeof perWeek?.value === 'number' && perWeek.value > 0 ? Math.min(7, Math.round(perWeek.value)) : DEFAULT_TARGET_PER_WEEK,
    sessions: sessions.filter((s) => s.finishedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    activities,
    foodEntries,
    foods,
    water,
    weights,
    sleep,
    moods,
    lifts: { maxes: asKgRecord(maxes?.value), trainingMaxes: asKgRecord(tms?.value), tmLog: asTmLog(tmLog?.value) },
    habits: habitIdx.habits,
    habitDone: habitIdx.done,
  }
}

/* ------------------------------- helpers ------------------------------- */

const WEEKDAY_ACC = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье']
const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const isTrainingDay = (d: ProgramDay | null | undefined): d is ProgramDay => !!d && d.type !== 'rest' && d.exercises.length > 0
const dayAt = (program: Program | null, weekday: number) => program?.days.find((d) => d.weekday === weekday) ?? null
const isLegDay = (d: ProgramDay | null | undefined) =>
  !!d && (d.type === 'legs' || d.type === 'lower' || d.exercises.some((e) => /squat|присед/i.test(e.exerciseId + e.name)))
/** Sequential programs: the day `offset` steps from today's (next) day in the rotation. */
const rotationDay = (d: Pick<CoachData, 'program' | 'todayDay'>, offset: number): ProgramDay | null => {
  const days = d.program?.days ?? []
  const idx = d.todayDay ? days.findIndex((x) => x.id === d.todayDay?.id) : -1
  if (idx < 0 || days.length === 0) return null
  return days[(((idx + offset) % days.length) + days.length) % days.length]
}
const startLink = (program: Program | null, day: ProgramDay) =>
  program ? `/workouts/start/${program.id}/${day.id}` : '/workouts'
const pct = (n: number) => `${Math.round(n * 100)} %`
const kcalByDay = (entries: FoodEntry[]) => {
  const m = new Map<string, { kcal: number; protein: number }>()
  for (const e of entries) {
    const cur = m.get(e.date) ?? { kcal: 0, protein: 0 }
    cur.kcal += e.kcal || 0
    cur.protein += e.proteinG || 0
    m.set(e.date, cur)
  }
  return m
}
const weekVolume = (sessions: WorkoutSession[], weekStart: ISODate) => {
  const end = shiftDate(weekStart, 6)
  const inWeek = sessions.filter((s) => {
    const d = localDay(s.startedAt)
    return d >= weekStart && d <= end
  })
  return { workouts: inWeek.length, volume: sum(inWeek.map(sessionVolumeKg)) }
}

/* -------------------------------- rules -------------------------------- */

/** 1. Progression after the latest session (within 10 days). */
export function ruleProgression(d: CoachData): Insight[] {
  const last = d.sessions[0]
  if (!last || daysBetween(localDay(last.startedAt), d.today) > 10) return []
  const advice: ProgressionAdvice[] = []
  for (const ex of last.exercises) {
    if (advice.some((a) => a.exerciseId === ex.exerciseId)) continue
    const prev = previousEntry(d.sessions, ex.exerciseId, last.startedAt, last.id)
    const program = d.program && d.program.id === last.programId ? d.program : undefined
    const a = adviseNext(ex, prev, {
      ...d.lifts,
      sessionId: last.id,
      maxLiftId: programExerciseFor(program, last.programDayId, ex.exerciseId)?.maxLiftId,
    })
    if (a && a.action !== 'hold') advice.push(a)
  }
  if (advice.length === 0) return []
  const up = advice.filter((a) => a.action === 'increase')
  const word = (n: number) => `${n} ${plural(n, ['упражнение', 'упражнения', 'упражнений'])}`
  const title = up.length ? `Прибавь вес: ${word(up.length)}` : `Сбавь вес: ${word(advice.length)}`
  const body = advice
    .slice(0, 4)
    .map((a) => `${a.name}: ${adviceLabel(a)}`)
    .join(' · ')
  const next = d.program
    ? d.program.days.find((day) => day.id === last.programDayId && isTrainingDay(day)) ?? null
    : null
  return [
    {
      id: `progression:${last.id}`,
      rule: 'progression',
      kind: 'training',
      priority: 2,
      title,
      body: `${body}${advice.length > 4 ? ' …' : ''}. В следующий раз на «${last.name}».`,
      evidence: advice.map((a) => `${a.name}: ${a.sets.map((s) => `${fmtKg(s.weightKg)}×${s.reps}`).join(', ')} — ${a.reason}`),
      ...(next ? { action: { label: 'Открыть день', to: startLink(d.program, next) } } : {}),
    },
  ]
}

/** 2. Poor sleep → trim accessory volume today. */
export function ruleSleepVolume(d: CoachData): Insight[] {
  const byDate = new Map(d.sleep.map((s) => [s.date, s.durationMin]))
  const lastNight = byDate.get(d.today)
  const recent = [d.today, shiftDate(d.today, -1), shiftDate(d.today, -2)]
    .map((x) => byDate.get(x))
    .filter((m): m is number => m != null && m > 0)
  const avg3 = recent.length >= 2 ? sum(recent) / recent.length : null
  const short = lastNight != null && lastNight > 0 && lastNight < 360
  const lowAvg = avg3 != null && avg3 < 390
  if (!short && !lowAvg) return []
  const evidence = [
    ...(lastNight != null ? [`Сон прошлой ночи: ${formatMinutes(lastNight)}`] : []),
    ...(avg3 != null ? [`Среднее за ${recent.length} ${plural(recent.length, ['ночь', 'ночи', 'ночей'])}: ${formatMinutes(avg3)}`] : []),
  ]
  const day = d.todayDay
  if (!isTrainingDay(day) || d.sessions.some((s) => localDay(s.startedAt) === d.today)) {
    return [
      {
        id: `sleep_volume:${d.today}`,
        rule: 'sleep_volume',
        kind: 'sleep',
        priority: 3,
        title: 'Недосып — ляг сегодня пораньше',
        body: 'Восстановление важнее рекордов: цель — минимум 7 часов сна. Отложи экран за 30 минут до сна.',
        evidence,
        action: { label: 'Записать сон', to: '/sleep/new' },
      },
    ]
  }
  const accessories = day.exercises.slice(1).map((e) => e.name)
  const heavy = isLegDay(day) || day.type === 'pull' || day.exercises.some((e) => /deadlift|станов/i.test(e.exerciseId + e.name))
  return [
    {
      id: `sleep_volume:${d.today}`,
      rule: 'sleep_volume',
      kind: 'recovery',
      priority: 1,
      title: 'Мало сна — урежь объём',
      body:
        `Сегодня убери по одному подходу во вспомогательных${accessories.length ? ` (${accessories.slice(0, 3).join(', ')})` : ''}.` +
        (heavy ? ' Тяжёлый день — не иди на рекорд, работай с запасом 2–3 повтора.' : ''),
      evidence: [...evidence, d.sequential ? `Следующая тренировка: ${day.name}` : `По плану: ${day.name}`],
      action: { label: 'Начать тренировку', to: startLink(d.program, day) },
    },
  ]
}

/** 3. Calories off target by > 15 % over 7 days; protein < 80 % three days in a row. */
export function ruleNutrition(d: CoachData): Insight[] {
  const t = d.targets
  if (!t) return []
  const out: Insight[] = []
  const days = kcalByDay(d.foodEntries)
  const past = Array.from({ length: 7 }, (_, i) => shiftDate(d.today, -(i + 1)))
  const logged = past.map((x) => days.get(x)).filter((v): v is { kcal: number; protein: number } => !!v && v.kcal > 0)
  if (logged.length >= 3) {
    const mean = sum(logged.map((v) => v.kcal)) / logged.length
    const dev = (mean - t.kcal) / t.kcal
    if (Math.abs(dev) > 0.15) {
      const diff = Math.round(Math.abs(mean - t.kcal) / 50) * 50
      const under = dev < 0
      out.push({
        id: `nutrition_kcal:${under ? 'under' : 'over'}`,
        rule: 'nutrition',
        kind: 'nutrition',
        priority: 2,
        title: under ? `Калорий на ${pct(-dev)} меньше нормы` : `Калорий на ${pct(dev)} больше нормы`,
        body: under
          ? `Слишком глубокий дефицит бьёт по силе и мышцам. Добавь ~${diff} ккал в день — порцию крупы или перекус с белком.`
          : `Перебор ~${diff} ккал в день съедает прогресс. Начни с ужина и перекусов — там проще всего срезать.`,
        evidence: [
          `Среднее за ${logged.length} ${plural(logged.length, ['день', 'дня', 'дней'])}: ${Math.round(mean)} ккал`,
          `Норма: ${t.kcal} ккал`,
        ],
        action: { label: 'Дневник питания', to: '/nutrition' },
      })
    }
  }
  const last3 = past.slice(0, 3).map((x) => days.get(x))
  if (last3.every((v) => v && v.kcal > 0 && v.protein < t.proteinG * 0.8)) {
    const examples = [...d.foods]
      .filter((f) => f.proteinG >= 10 && f.kcal > 0)
      .sort((a, b) => b.proteinG / b.kcal - a.proteinG / a.kcal)
      .slice(0, 3)
      .map((f) => `${f.name} (${round(f.proteinG, 1)} г на 100 г)`)
    const list = examples.length ? examples.join(', ') : 'творог, куриная грудка, яйца, греческий йогурт'
    out.push({
      id: 'nutrition_protein',
      rule: 'nutrition',
      kind: 'nutrition',
      priority: 2,
      title: 'Добавь белок',
      body: `Три дня подряд белка меньше 80 % нормы. Добавь 1–2 порции: ${list}.`,
      evidence: [
        ...past.slice(0, 3).map((x, i) => `${x}: ${Math.round(last3[i]?.protein ?? 0)} г белка`),
        `Норма: ${t.proteinG} г`,
      ],
      action: { label: 'Добавить еду', to: '/nutrition' },
    })
  }
  return out
}

/** 4. 14-day weight trend not moving towards the goal. */
export function ruleWeightPlateau(d: CoachData): Insight[] {
  const goal = d.profile?.goal
  if (!goal || goal === 'maintain' || !d.targets) return []
  const from = windowStart(d.today, 14)
  const mid = shiftDate(d.today, -7)
  const ws = d.weights.filter((w) => w.date >= from && w.date <= d.today)
  if (ws.length < 10) return []
  const first = avg(ws.filter((w) => w.date <= mid).map((w) => w.weightKg))
  const second = avg(ws.filter((w) => w.date > mid).map((w) => w.weightKg))
  if (first == null || second == null) return []
  const delta = second - first
  const towards = goal === 'cut' ? -delta : delta
  if (towards >= 0.3) return []
  const target = d.profile?.targetWeightKg
  if (target != null && (goal === 'cut' ? second <= target : second >= target)) return []
  const kcal7 = [...kcalByDay(d.foodEntries.filter((e) => e.date >= windowStart(d.today, 7) && e.date < d.today)).values()]
    .map((v) => v.kcal)
    .filter((k) => k > 0)
  const meanKcal = kcal7.length >= 3 ? sum(kcal7) / kcal7.length : null
  const offPlan = meanKcal != null && (goal === 'cut' ? meanKcal > d.targets.kcal * 1.05 : meanKcal < d.targets.kcal * 0.95)
  const sign = goal === 'cut' ? -100 : 100
  return [
    {
      id: 'weight_plateau',
      rule: 'weight_plateau',
      kind: 'weight',
      priority: 2,
      title: goal === 'cut' ? 'Вес стоит — пора подкрутить' : 'Набор застопорился',
      body: offPlan
        ? `Сначала попади в норму: в среднем ${Math.round(meanKcal!)} ккал против ${d.targets.kcal}. Если через неделю вес не сдвинется — пересмотри активность.`
        : `${sign > 0 ? '+' : '−'}100 ккал в день (новая цель ~${d.targets.kcal + sign} ккал)${goal === 'cut' ? ' или +2–3 тыс. шагов' : ''}. Либо пересмотри уровень активности в профиле.`,
      evidence: [
        `Среднее неделю назад: ${fmtKg(round(first, 1))} кг`,
        `Среднее за последнюю неделю: ${fmtKg(round(second, 1))} кг (${delta >= 0 ? '+' : '−'}${fmtKg(Math.abs(round(delta, 2)))} кг)`,
        `Взвешиваний за 14 дней: ${ws.length}`,
      ],
      action: { label: 'Пересчитать норму', to: '/nutrition/plan' },
    },
  ]
}

/** 5. Cut with < 2 cardio sessions in 7 days → suggest 30 min swim/walk on a rest day away from leg days. */
export function ruleCardio(d: CoachData): Insight[] {
  if (d.profile?.goal !== 'cut') return []
  const from = windowStart(d.today, 7)
  const cardio = d.activities.filter((a) => a.type !== 'stretch' && a.date >= from && a.date <= d.today)
  if (cardio.length >= 2) return []
  const trainedToday = d.sessions.some((s) => localDay(s.startedAt) === d.today)
  let when: string
  let legDays: string[] = []
  if (d.sequential) {
    // No fixed weekdays: look at the rotation. Keep the day before a leg session free of cardio.
    const next = d.todayDay
    when = isLegDay(next)
      ? `в день отдыха после «${next!.name}»`
      : trainedToday || d.hour >= 20
        ? 'завтра'
        : 'сегодня, если не идёшь в зал'
    legDays = d.program?.days.filter(isLegDay).map((x) => x.name) ?? []
  } else {
    const wd = weekdayIndex(d.now)
    let pick: number | null = null
    for (let i = d.hour < 20 ? 0 : 1; i < 7 && pick == null; i++) {
      const w = (wd + i) % 7
      const day = dayAt(d.program, w)
      if (isTrainingDay(day) || isLegDay(dayAt(d.program, (w + 1) % 7))) continue
      if (i === 0 && trainedToday) continue
      pick = i
    }
    when = pick == null ? 'в ближайший свободный день' : pick === 0 ? 'сегодня' : pick === 1 ? 'завтра' : WEEKDAY_ACC[(wd + pick) % 7]
    legDays = d.program?.days.filter((x) => isLegDay(x) && x.weekday != null).map((x) => WEEKDAY_SHORT[x.weekday!]) ?? []
  }
  return [
    {
      id: 'cardio',
      rule: 'cardio',
      kind: 'cardio',
      priority: 2,
      title: 'Добавь кардио',
      body: `30 минут бассейна или быстрой ходьбы ${when} — день отдыха, ноги к следующей тренировке успеют восстановиться.`,
      evidence: [
        `Кардио за 7 дней: ${cardio.length} из 2`,
        'Цель: сушка',
        ...(legDays.length ? [`Дни ног: ${legDays.join(', ')}`] : []),
        ...(d.sequential && d.todayDay ? [`Следующая тренировка: ${d.todayDay.name}`] : []),
      ],
      action: { label: 'Записать прогулку', to: '/cardio/new?type=walk' },
    },
  ]
}

/** 6. Four hard weeks (≥ 4 sessions, or ≥ 3 when the weekly target is 3) with growing volume → deload. */
export function ruleDeload(d: CoachData): Insight[] {
  const minWorkouts = Math.max(3, Math.min(4, d.targetPerWeek))
  const cur = weekDates(d.now)[0]
  const weeks = (offset: number) => [0, 1, 2, 3].map((k) => weekVolume(d.sessions, shiftDate(cur, -7 * (k + offset))))
  const check = (ws: ReturnType<typeof weeks>) => ws.every((w) => w.workouts >= minWorkouts) && ws[0].volume > ws[3].volume
  const thisWeek = weeks(0)
  const variant = check(thisWeek) ? 'next' : check(weeks(1)) ? 'now' : null
  if (!variant) return []
  const ws = variant === 'next' ? thisWeek : weeks(1)
  return [
    {
      id: `deload:${cur}`,
      rule: 'deload',
      kind: 'training',
      priority: 1,
      title: variant === 'next' ? 'На следующей неделе — разгрузка' : 'Эта неделя — разгрузочная',
      body: 'Четыре плотные недели подряд с ростом объёма. Сократи объём на 35 %: меньше подходов, те же веса. Это ускорит прогресс, а не замедлит.',
      evidence: [...ws]
        .reverse()
        .map((w, i) => `Неделя ${i + 1}: ${w.workouts} ${plural(w.workouts, ['тренировка', 'тренировки', 'тренировок'])}, ${Math.round(w.volume).toLocaleString('ru-RU')} кг`),
    },
  ]
}

/** Sessions finished in the Monday-based week starting at `weekStart`. */
const weekWorkouts = (sessions: WorkoutSession[], weekStart: ISODate) => weekVolume(sessions, weekStart).workouts

/**
 * The program day to do next: today's day (sequential programs: the next rotation day; weekday
 * programs: the day fixed to today), else the next training day of the rotation / the day after
 * the last session's day in program order, else the first training day.
 */
export function nextProgramDay(d: CoachData): ProgramDay | null {
  if (!d.program) return null
  if (isTrainingDay(d.todayDay)) return d.todayDay
  if (d.sequential) {
    for (let i = 1; i <= d.program.days.length; i++) {
      const x = rotationDay(d, i)
      if (isTrainingDay(x)) return x
    }
    return null
  }
  const training = d.program.days.filter(isTrainingDay)
  if (training.length === 0) return null
  const lastDayId = d.sessions.find((s) => s.programId === d.program?.id && s.programDayId)?.programDayId
  const idx = training.findIndex((x) => x.id === lastDayId)
  return training[idx >= 0 ? (idx + 1) % training.length : 0]
}

/**
 * 7. Weekly frequency (target `training.targetPerWeek`, default 3):
 *  - remaining days of the week ≤ sessions still missing → insist (priority 1);
 *  - otherwise a gentle "1 из 3 на этой неделе" nudge (priority 3);
 *  - target reached → positive insight with the streak of weeks that hit it.
 */
export function ruleFrequency(d: CoachData): Insight[] {
  const target = d.targetPerWeek
  if (target <= 0) return []
  const weekStart = weekDates(d.now)[0]
  const done = weekWorkouts(d.sessions, weekStart)
  const doneLabel = `${done} из ${target}`
  if (done >= target) {
    let streak = 1
    while (streak < 52 && weekWorkouts(d.sessions, shiftDate(weekStart, -7 * streak)) >= target) streak++
    return [
      {
        id: `frequency_done:${weekStart}`,
        rule: 'frequency',
        kind: 'motivation',
        priority: 3,
        title: `${doneLabel} — неделя закрыта`,
        body:
          streak > 1
            ? `${streak} ${plural(streak, ['неделя', 'недели', 'недель'])} подряд без пропусков. Стабильность — главный двигатель прогресса.`
            : 'План недели выполнен. Остаток недели — восстановление, кардио или растяжка.',
        evidence: [`Тренировок на этой неделе: ${done}`, `Недель подряд с ≥ ${target}: ${streak}`],
      },
    ]
  }
  const missing = target - done
  const trainedToday = d.sessions.some((s) => localDay(s.startedAt) === d.today)
  const wd = weekdayIndex(d.now)
  const available = 7 - wd - (trainedToday ? 1 : 0)
  const day = nextProgramDay(d)
  const evidence = [
    `Тренировок на этой неделе: ${doneLabel}`,
    ...(d.scheduleLabel ? [`Программа: ${d.scheduleLabel}`] : []),
    `Дней до конца недели: ${available}`,
    ...(d.sessions[0] ? [`Последняя тренировка: ${localDay(d.sessions[0].startedAt)}`] : []),
  ]
  const action = day ? { action: { label: `Начать «${day.name}»`, to: startLink(d.program, day) } } : {}
  if (available <= missing && available > 0) {
    const when = trainedToday ? 'завтра' : 'сегодня'
    return [
      {
        id: `frequency:${weekStart}`,
        rule: 'frequency',
        kind: 'training',
        priority: 1,
        title: `Тренировок ${doneLabel} — ${when} нужен зал`,
        body: `До конца недели ${available} ${plural(available, ['день', 'дня', 'дней'])}, тренировок ${doneLabel} — ${when} лучший день${day ? ` для «${day.name}»` : ''}.`,
        evidence,
        ...action,
      },
    ]
  }
  return [
    {
      id: `frequency:${weekStart}`,
      rule: 'frequency',
      kind: 'training',
      priority: 3,
      title: `${doneLabel} на этой неделе`,
      body: `Ещё ${missing} ${plural(missing, ['тренировка', 'тренировки', 'тренировок'])} до цели${day ? `; следующая по программе — «${day.name}»` : ''}.`,
      evidence,
      ...action,
    },
  ]
}

/** 8. Yesterday every daily habit was done, today none after 18:00. */
export function ruleHabitsStreak(d: CoachData): Insight[] {
  if (d.hour < 18) return []
  const yesterday = shiftDate(d.today, -1)
  const daily = d.habits.filter((h) => h.frequency === 'daily' && localDay(h.createdAt) <= yesterday)
  if (daily.length === 0) return []
  const doneOn = (x: ISODate) => daily.every((h) => d.habitDone.get(h.id)?.has(x))
  if (!doneOn(yesterday)) return []
  if (daily.some((h) => d.habitDone.get(h.id)?.has(d.today))) return []
  let streak = 0
  for (let x = yesterday; doneOn(x) && streak < 60; x = shiftDate(x, -1)) streak++
  return [
    {
      id: 'habits_streak',
      rule: 'habits_streak',
      kind: 'habits',
      priority: 1,
      title: 'Серия привычек под угрозой',
      body: `Вчера ты закрыл все привычки — ${streak} ${plural(streak, ['день', 'дня', 'дней'])} подряд. Отметь сегодняшние, пока день не закончился.`,
      evidence: [`Ежедневных привычек: ${daily.length}`, 'Сегодня отмечено: 0', `Серия: ${streak}`],
      action: { label: 'К привычкам', to: '/habits' },
    },
  ]
}

/** 9. Less than 60 % of the water target by 16:00. */
export function ruleWater(d: CoachData): Insight[] {
  if (d.hour < 16 || d.hour >= 22) return []
  const target = d.profile?.waterTargetMl || DEFAULT_WATER_TARGET_ML
  const ml = sum(d.water.filter((w) => w.date === d.today).map((w) => w.ml))
  if (ml >= target * 0.6) return []
  return [
    {
      id: 'water',
      rule: 'water',
      kind: 'nutrition',
      priority: 2,
      title: 'Выпей 500 мл воды',
      body: `К вечеру выпито ${pct(ml / target)} нормы. Стакан сейчас и бутылку на тренировку — и норма закрыта.`,
      evidence: [`Выпито: ${ml} мл из ${target} мл`, `Время: ${d.hour}:00`],
      action: { label: 'Отметить воду', to: '/nutrition' },
    },
  ]
}

/** 10. Positive: new PRs this week, best volume week, active-day streak. */
export function ruleRecords(d: CoachData): Insight[] {
  const out: Insight[] = []
  const from = windowStart(d.today, 7)
  const prs: { name: string; text: string; gain: number }[] = []
  for (const s of d.sessions.filter((x) => localDay(x.startedAt) >= from)) {
    const earlier = d.sessions.filter((x) => x.startedAt < s.startedAt)
    const seen = new Set<string>()
    for (const ex of s.exercises) {
      if (seen.has(ex.exerciseId)) continue
      seen.add(ex.exerciseId)
      const best = bestSet(s.exercises.filter((e) => e.exerciseId === ex.exerciseId).flatMap((e) => workSets(e.sets)))
      const prev = earlier.flatMap((x) => x.exercises.filter((e) => e.exerciseId === ex.exerciseId).flatMap((e) => workSets(e.sets)))
      if (!best || best.weightKg <= 0 || prev.length === 0) continue
      const prevMax = Math.max(...prev.map((p) => e1rm(p.weightKg, p.reps)))
      const cur = e1rm(best.weightKg, best.reps)
      if (cur > prevMax + 1e-9 && !prs.some((p) => p.name === ex.name))
        prs.push({ name: ex.name, text: `${ex.name}: ${fmtKg(best.weightKg)} кг × ${best.reps} (≈1ПМ ${fmtKg(round(cur, 1))} кг)`, gain: cur / prevMax })
    }
  }
  if (prs.length) {
    prs.sort((a, b) => b.gain - a.gain)
    out.push({
      id: 'records_pr',
      rule: 'records',
      kind: 'motivation',
      priority: 3,
      title: prs.length === 1 ? `Новый рекорд: ${prs[0].name}` : `${prs.length} ${plural(prs.length, ['рекорд', 'рекорда', 'рекордов'])} за неделю`,
      body: 'Сила растёт — так держать. Записывай веса честно, и прогрессия будет видна в цифрах.',
      evidence: prs.slice(0, 4).map((p) => p.text),
      action: { label: 'Прогресс', to: '/progress' },
    })
  }
  const cur = weekDates(d.now)[0]
  const thisWeek = weekVolume(d.sessions, cur).volume
  const previous = Array.from({ length: 12 }, (_, i) => weekVolume(d.sessions, shiftDate(cur, -7 * (i + 1))).volume).filter((v) => v > 0)
  if (thisWeek > 0 && previous.length >= 3 && thisWeek > Math.max(...previous)) {
    out.push({
      id: `records_week:${cur}`,
      rule: 'records',
      kind: 'motivation',
      priority: 3,
      title: 'Лучшая неделя по объёму',
      body: `${Math.round(thisWeek).toLocaleString('ru-RU')} кг — больше, чем за любую из последних недель. Не забудь про сон и белок, чтобы закрепить результат.`,
      evidence: [`Эта неделя: ${Math.round(thisWeek).toLocaleString('ru-RU')} кг`, `Прошлый максимум: ${Math.round(Math.max(...previous)).toLocaleString('ru-RU')} кг`],
    })
  }
  const active = new Set([...d.sessions.map((s) => localDay(s.startedAt)), ...d.activities.map((a) => a.date)])
  let streak = 0
  for (let x = active.has(d.today) ? d.today : shiftDate(d.today, -1); active.has(x) && streak < 60; x = shiftDate(x, -1)) streak++
  if (streak >= 4) {
    out.push({
      id: 'records_streak',
      rule: 'records',
      kind: 'motivation',
      priority: 3,
      title: `${streak} ${plural(streak, ['день', 'дня', 'дней'])} активности подряд`,
      body: 'Зал, кардио или растяжка — каждый день в движении. Отличная серия, только оставь место для отдыха.',
      evidence: [`Активные дни подряд: ${streak}`],
    })
  }
  return out
}

/** 11. Average stress ≥ 4 over 3 days → light session or 5 minutes of breathing. */
export function ruleStress(d: CoachData): Insight[] {
  const from = windowStart(d.today, 3)
  const values = d.moods.filter((m) => m.date >= from && m.stress != null).map((m) => m.stress as number)
  if (values.length < 2) return []
  const mean = sum(values) / values.length
  if (mean < 4) return []
  const training = isTrainingDay(d.todayDay)
  return [
    {
      id: `stress:${d.today}`,
      rule: 'stress',
      kind: 'recovery',
      priority: training ? 1 : 2,
      title: 'Высокий стресс — сбавь обороты',
      body: training
        ? 'Сегодня лёгкая сессия: минус подход в каждом упражнении, без отказа. Или замени её 5 минутами дыхания и прогулкой.'
        : '5 минут дыхания сейчас заметно снизят напряжение. Вечером — прогулка без телефона.',
      evidence: [`Средний стресс за 3 дня: ${round(mean, 1).toString().replace('.', ',')} из 5`, `Отметок: ${values.length}`],
      action: { label: 'Дыхание 5 мин', to: '/mind/breathe' },
    },
  ]
}

/* ------------------------------- registry ------------------------------- */

export interface CoachRule {
  id: RuleId
  name: string
  description: string
  kind: InsightKind
  /** Rules in the same group give overlapping advice; only the most important survives */
  group?: string
  run: (d: CoachData) => Insight[]
}

export const RULES: CoachRule[] = [
  { id: 'progression', name: 'Прогрессия весов', description: 'Прибавка, повтор или −5 % по итогам прошлой тренировки', kind: 'training', run: ruleProgression },
  { id: 'sleep_volume', name: 'Сон и объём', description: 'Меньше подходов после короткой ночи', kind: 'recovery', group: 'load', run: ruleSleepVolume },
  { id: 'nutrition', name: 'Калории и белок', description: 'Отклонение от нормы ккал > 15 %, белок < 80 % три дня', kind: 'nutrition', run: ruleNutrition },
  { id: 'weight_plateau', name: 'Плато веса', description: 'Вес за 14 дней не движется к цели', kind: 'weight', run: ruleWeightPlateau },
  { id: 'cardio', name: 'Кардио на сушке', description: 'Меньше 2 кардио-сессий за неделю', kind: 'cardio', run: ruleCardio },
  { id: 'deload', name: 'Разгрузка', description: '4 плотные недели подряд с ростом объёма', kind: 'training', run: ruleDeload },
  { id: 'frequency', name: 'Частота тренировок', description: 'Цель тренировок в неделю (по умолчанию 3): напоминание и итог недели', kind: 'training', run: ruleFrequency },
  { id: 'habits_streak', name: 'Серия привычек', description: 'Вечернее напоминание, если серия под угрозой', kind: 'habits', run: ruleHabitsStreak },
  { id: 'water', name: 'Вода', description: 'Меньше 60 % нормы к 16:00', kind: 'nutrition', run: ruleWater },
  { id: 'records', name: 'Рекорды и мотивация', description: 'Новые рекорды, лучшая неделя, серия активных дней', kind: 'motivation', run: ruleRecords },
  { id: 'stress', name: 'Стресс', description: 'Средний стресс ≥ 4 за 3 дня', kind: 'recovery', group: 'load', run: ruleStress },
]

export const RULES_SETTING_KEY = 'coach.rules'
export const dismissedKey = (date: ISODate) => `coach.dismissed:${date}`

/** Rule id → enabled; missing ids are enabled. */
export async function getRuleSettings(db: FormaDB): Promise<Partial<Record<RuleId, boolean>>> {
  const s = await db.settings.get(RULES_SETTING_KEY)
  return s?.value && typeof s.value === 'object' ? (s.value as Partial<Record<RuleId, boolean>>) : {}
}

export async function setRuleEnabled(db: FormaDB, id: RuleId, enabled: boolean): Promise<void> {
  const cur = await getRuleSettings(db)
  await db.settings.put({ key: RULES_SETTING_KEY, value: { ...cur, [id]: enabled } })
}

export async function getDismissed(db: FormaDB, date: ISODate): Promise<string[]> {
  const s = await db.settings.get(dismissedKey(date))
  return Array.isArray(s?.value) ? (s.value as string[]) : []
}

/** Hide an insight for the rest of the day. */
export async function dismissInsight(db: FormaDB, id: string, now: Date = new Date()): Promise<void> {
  const date = toISODate(now)
  const cur = await getDismissed(db, date)
  if (!cur.includes(id)) await db.settings.put({ key: dismissedKey(date), value: [...cur, id] })
}

/** Bring back one hidden insight for today. */
export async function undismissInsight(db: FormaDB, id: string, now: Date = new Date()): Promise<void> {
  const date = toISODate(now)
  const cur = await getDismissed(db, date)
  if (cur.includes(id)) await db.settings.put({ key: dismissedKey(date), value: cur.filter((x) => x !== id) })
}

export async function restoreDismissed(db: FormaDB, now: Date = new Date()): Promise<void> {
  await db.settings.delete(dismissedKey(toISODate(now)))
}

/**
 * Runs enabled rules, merges overlapping advice (same id, same group), drops dismissed
 * insights and sorts by priority (1 first), keeping the rule order for ties.
 */
export function rankInsights(
  raw: Insight[],
  opts: { dismissed?: string[]; groups?: Partial<Record<RuleId, string>> } = {},
): Insight[] {
  const order = new Map(RULES.map((r, i) => [r.id, i]))
  const groups = opts.groups ?? Object.fromEntries(RULES.filter((r) => r.group).map((r) => [r.id, r.group]))
  const sorted = [...raw].sort((a, b) => a.priority - b.priority || (order.get(a.rule) ?? 99) - (order.get(b.rule) ?? 99))
  const out: Insight[] = []
  const byGroup = new Map<string, Insight>()
  for (const ins of sorted) {
    if (out.some((x) => x.id === ins.id)) continue
    const g = groups[ins.rule]
    const kept = g ? byGroup.get(g) : undefined
    if (kept) {
      for (const e of ins.evidence) if (!kept.evidence.includes(e)) kept.evidence.push(e)
      continue
    }
    const copy = { ...ins, evidence: [...ins.evidence] }
    if (g) byGroup.set(g, copy)
    out.push(copy)
  }
  const dismissed = new Set(opts.dismissed ?? [])
  return out.filter((x) => !dismissed.has(x.id))
}

export interface GenerateOptions {
  /** Include insights hidden for today */
  includeDismissed?: boolean
  /** Override stored rule toggles */
  rules?: Partial<Record<RuleId, boolean>>
}

export async function generateInsights(db: FormaDB, now: Date = new Date(), opts: GenerateOptions = {}): Promise<Insight[]> {
  const [data, ruleSettings, dismissed] = await Promise.all([
    loadCoachData(db, now),
    opts.rules ? Promise.resolve(opts.rules) : getRuleSettings(db),
    opts.includeDismissed ? Promise.resolve([]) : getDismissed(db, toISODate(now)),
  ])
  const raw: Insight[] = []
  for (const rule of RULES) {
    if (ruleSettings[rule.id] === false) continue
    try {
      raw.push(...rule.run(data))
    } catch (err) {
      // One broken rule must never hide the others.
      console.error(`coach rule ${rule.id} failed`, err)
    }
  }
  return rankInsights(raw, { dismissed })
}

/** At most `n` insights for the Today brief: the highest priority, one per kind. */
export function pickBrief(insights: Insight[], n = 3): Insight[] {
  const out: Insight[] = []
  for (const ins of insights) {
    if (out.length >= n) break
    if (out.some((x) => x.kind === ins.kind)) continue
    out.push(ins)
  }
  for (const ins of insights) {
    if (out.length >= n) break
    if (!out.includes(ins)) out.push(ins)
  }
  return out.sort((a, b) => a.priority - b.priority)
}

