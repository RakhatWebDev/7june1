import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns'
import type { FormaDB } from '../../db'
import type { Program, ProgramCycleState, ProgramDay } from '../../db/types'
import { fromISODate, toISODate, weekdayIndex } from '../../lib/dates'

/* ------------------------------------------------------------------ */
/* Program scheduling: which day is next and which cycle week it is.   */
/*  - 'weekday' programs: the day fixed to today's weekday             */
/*  - 'sequential' programs: days rotate in order; `nextDayIndex`      */
/*    advances when that day's session is finished and the week grows */
/*    by one on every wrap (the owner trains 2–3×/week, so a "week" is */
/*    one pass through the day list, not 7 calendar days)              */
/* ------------------------------------------------------------------ */

export const CYCLE_KEY_PREFIX = 'program.cycle:'
export const TARGET_PER_WEEK_KEY = 'training.targetPerWeek'
export const DEFAULT_TARGET_PER_WEEK = 3

export const cycleKey = (programId: string) => `${CYCLE_KEY_PREFIX}${programId}`

export function defaultCycleState(now: Date = new Date()): ProgramCycleState {
  return { startDate: toISODate(now), week: 0, nextDayIndex: 0 }
}

/** Sanitises a stored settings value. */
export function asCycleState(value: unknown): ProgramCycleState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  if (typeof v.startDate !== 'string') return undefined
  const out: ProgramCycleState = { startDate: v.startDate }
  if (typeof v.week === 'number' && Number.isInteger(v.week) && v.week >= 0) out.week = v.week
  if (typeof v.nextDayIndex === 'number' && Number.isInteger(v.nextDayIndex) && v.nextDayIndex >= 0)
    out.nextDayIndex = v.nextDayIndex
  return out
}

/**
 * Raw 0-based cycle week (may be ≥ `program.weeks` — then it is the test week).
 * Explicit `week` wins; otherwise it is derived from `startDate` (calendar weeks).
 */
export function cycleWeek(state: ProgramCycleState, now: Date = new Date()): number {
  if (state.week != null) return state.week
  return Math.max(0, Math.floor(differenceInCalendarDays(now, fromISODate(state.startDate)) / 7))
}

export interface ScheduledDay {
  program: Program
  sequential: boolean
  day?: ProgramDay
  /** Index of `day` in `program.days` (-1 when none) */
  dayIndex: number
  /** Raw 0-based cycle week; undefined for programs without weeks */
  week?: number
  /** Week whose prescriptions apply (clamped to the cycle) */
  prescriptionWeek?: number
  /** The cycle is over: time to test new maxes and restart */
  isTestWeek: boolean
  state: ProgramCycleState
}

/** Pure schedule resolution. */
export function resolveSchedule(
  program: Program,
  stored: ProgramCycleState | undefined,
  now: Date = new Date(),
): ScheduledDay {
  const sequential = program.schedule === 'sequential'
  const state = stored ?? defaultCycleState(now)
  let dayIndex: number
  if (sequential) {
    dayIndex = program.days.length > 0 ? (state.nextDayIndex ?? 0) % program.days.length : -1
  } else {
    const wd = weekdayIndex(now)
    dayIndex = program.days.findIndex((d) => d.weekday === wd)
  }
  const weeks = program.weeks
  const week = weeks ? cycleWeek(state, now) : undefined
  return {
    program,
    sequential,
    day: dayIndex >= 0 ? program.days[dayIndex] : undefined,
    dayIndex,
    week,
    prescriptionWeek: weeks && week != null ? Math.min(week, weeks - 1) : undefined,
    isTestWeek: !!weeks && week != null && week >= weeks,
    state,
  }
}

export async function getCycleState(database: FormaDB, programId: string): Promise<ProgramCycleState | undefined> {
  return asCycleState((await database.settings.get(cycleKey(programId)))?.value)
}

/** Next/today's day of a program plus its cycle week. Safe inside `useLiveQuery`. */
export async function getScheduledDay(
  database: FormaDB,
  program: Program,
  now: Date = new Date(),
): Promise<ScheduledDay> {
  return resolveSchedule(program, await getCycleState(database, program.id), now)
}

/** «Неделя 2 · день 3 из 5» / «Тестовая неделя · день 1 из 5» / «Неделя 2»; undefined without weeks. */
export function scheduleLabel(
  s: Pick<ScheduledDay, 'program' | 'sequential' | 'dayIndex' | 'week' | 'isTestWeek'>,
): string | undefined {
  const parts: string[] = []
  if (s.week != null) parts.push(s.isTestWeek ? 'Тестовая неделя' : `Неделя ${s.week + 1}`)
  if (s.sequential && s.dayIndex >= 0) parts.push(`день ${s.dayIndex + 1} из ${s.program.days.length}`)
  return parts.length ? parts.join(' · ') : undefined
}

/** Label of a session started from a cyclic program: «Неделя 2 · день 3 из 5». */
export function sessionCycleLabel(
  program: Program | undefined,
  programDayId?: string,
  programWeek?: number,
): string | undefined {
  if (!program || programWeek == null) return undefined
  const idx = program.days.findIndex((d) => d.id === programDayId)
  return scheduleLabel({
    program,
    sequential: program.schedule === 'sequential',
    dayIndex: idx,
    week: programWeek,
    isTestWeek: false,
  })
}

/**
 * State after finishing a session of `dayId` (pure). Only the scheduled day advances the rotation;
 * wrapping past the last day increments the week. Returns null when nothing changes.
 */
export function advanceCycle(
  program: Program,
  stored: ProgramCycleState | undefined,
  dayId: string | undefined,
  now: Date = new Date(),
): ProgramCycleState | null {
  if (program.schedule !== 'sequential' || program.days.length === 0) return null
  const s = resolveSchedule(program, stored, now)
  if (!s.day || s.day.id !== dayId) return null
  let next = s.dayIndex + 1
  let week = s.week ?? s.state.week ?? 0
  if (next >= program.days.length) {
    next = 0
    week += 1
  }
  return { ...s.state, week, nextDayIndex: next }
}

export async function setCycleState(database: FormaDB, programId: string, state: ProgramCycleState) {
  await database.settings.put({ key: cycleKey(programId), value: state })
}

/** Manual week override (0-based). */
export async function setCycleWeek(database: FormaDB, program: Program, week: number, now: Date = new Date()) {
  const cur = (await getCycleState(database, program.id)) ?? defaultCycleState(now)
  await setCycleState(database, program.id, { ...cur, week })
}

/** «Начать цикл заново»: week 1, first day, start date = today. */
export async function restartCycle(database: FormaDB, programId: string, now: Date = new Date()) {
  await setCycleState(database, programId, defaultCycleState(now))
}

/* ------------------------- weekly frequency ------------------------- */

export function asTargetPerWeek(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7
    ? value
    : DEFAULT_TARGET_PER_WEEK
}

export async function setTargetPerWeek(database: FormaDB, n: number) {
  await database.settings.put({
    key: TARGET_PER_WEEK_KEY,
    value: Math.min(7, Math.max(1, Math.round(n))),
  })
}

/** Finished gym sessions this calendar week (Mon–Sun, local) vs the target («На этой неделе 1 из 3»). */
export async function getWeeklyProgress(
  database: FormaDB,
  now: Date = new Date(),
): Promise<{ done: number; target: number }> {
  const start = startOfWeek(now, { weekStartsOn: 1 })
  const end = addDays(start, 7)
  const [sessions, setting] = await Promise.all([
    database.sessions.where('startedAt').between(start.toISOString(), end.toISOString(), true, false).toArray(),
    database.settings.get(TARGET_PER_WEEK_KEY),
  ])
  return {
    done: sessions.filter((s) => s.finishedAt).length,
    target: asTargetPerWeek(setting?.value),
  }
}
