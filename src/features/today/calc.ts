import type { ActivityType, Program, ProgramDay, WorkoutSession } from '../../db/types'
import { toISODate } from '../../lib/dates'

/** Greeting by local hour of day. */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Доброе утро'
  if (hour >= 12 && hour < 18) return 'Добрый день'
  if (hour >= 18 && hour < 23) return 'Добрый вечер'
  return 'Доброй ночи'
}

/**
 * The program shown on the dashboard: `settings.activeProgramId` if it still exists,
 * else the first built-in program, else the first program at all.
 */
export function pickProgram(programs: Program[], activeProgramId?: unknown): Program | undefined {
  if (typeof activeProgramId === 'string') {
    const p = programs.find((x) => x.id === activeProgramId)
    if (p) return p
  }
  return programs.find((p) => p.isBuiltIn) ?? programs[0]
}

/** Program day scheduled for a Monday-based weekday index (0 = Monday). */
export function scheduledDay(program: Program | undefined, weekday: number): ProgramDay | undefined {
  return program?.days.find((d) => d.weekday === weekday)
}

/** «На этой неделе 1 из 3»; `extra` when the weekly target is already met (a session now is «Сверх плана»). */
export function weeklyProgress(done: number, target: number): { text: string; extra: boolean } {
  return { text: `На этой неделе ${done} из ${target}`, extra: done >= target }
}

/** Volume of a session: weight × reps of done, non-warm-up sets (see contract in TASKS.md). */
export function sessionVolume(session: Pick<WorkoutSession, 'exercises'>): number {
  let total = 0
  for (const ex of session.exercises)
    for (const s of ex.sets) if (s.done && !s.warmup && s.weightKg != null && s.reps != null) total += s.weightKg * s.reps
  return Math.round(total)
}

export function sessionLocalDate(s: Pick<WorkoutSession, 'startedAt'>): string {
  return toISODate(new Date(s.startedAt))
}

export const ACTIVITY_LABEL_RU: Record<ActivityType, string> = {
  run: 'Бег',
  bike: 'Велосипед',
  swim: 'Бассейн',
  rope: 'Скакалка',
  walk: 'Ходьба',
  stretch: 'Растяжка',
  hiit: 'HIIT',
  other: 'Другое',
}

export const ACTIVITY_ICON: Record<ActivityType, string> = {
  run: '🏃',
  bike: '🚴',
  swim: '🏊',
  rope: '🪢',
  walk: '🚶',
  stretch: '🧘',
  hiit: '⚡',
  other: '•',
}
