import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns'
import type { FormaDB } from '../../db'
import type { Program, ProgramCycleState, ProgramDay } from '../../db/types'
import { fromISODate, toISODate, weekdayIndex } from '../../lib/dates'

/* ------------------------------------------------------------------ */
/* Program scheduling: which day is next and which program week it is. */
/*  - 'sequential' programs: days rotate in order (`nextDayIndex`);    */
/*    the program week is counted by finished sessions:                */
/*    week = floor(completedSessions / sessionsPerWeek). The owner     */
/*    trains 3×/week, so a program week = 3 sessions, not 7 days; a    */
/*    4th session in a calendar week simply continues the rotation.    */
/*  - 'weekday' programs (custom ones): the day fixed to the weekday.  */
/* ------------------------------------------------------------------ */

export const CYCLE_KEY_PREFIX = 'program.cycle:'
export const TARGET_PER_WEEK_KEY = 'training.targetPerWeek'
export const DEFAULT_TARGET_PER_WEEK = 3

export const cycleKey = (programId: string) => `${CYCLE_KEY_PREFIX}${programId}`

export function defaultCycleState(now: Date = new Date()): ProgramCycleState {
  return { startDate: toISODate(now), completedSessions: 0, nextDayIndex: 0 }
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

/** Sanitises a stored settings value. */
export function asCycleState(value: unknown): ProgramCycleState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  if (typeof v.startDate !== 'string') return undefined
  const out: ProgramCycleState = { startDate: v.startDate }
  if (isCount(v.completedSessions)) out.completedSessions = v.completedSessions
  if (isCount(v.week)) out.week = v.week
  if (isCount(v.nextDayIndex)) out.nextDayIndex = v.nextDayIndex
  return out
}

/** Sessions that make one program week (3 for the built-ins). */
export function sessionsPerWeekOf(program: Program): number {
  return Math.max(1, program.sessionsPerWeek ?? program.daysPerWeek ?? program.days.length)
}

/** Finished sessions in the cycle; a legacy `week` override counts as that many full weeks. */
export function completedSessionsOf(state: ProgramCycleState, program: Program): number {
  if (state.completedSessions != null) return state.completedSessions
  return (state.week ?? 0) * sessionsPerWeekOf(program)
}

/**
 * Raw 0-based program week (≥ `program.weeks` once the program is complete).
 * Sequential programs count finished sessions; weekday programs count calendar weeks from `startDate`.
 */
export function cycleWeek(state: ProgramCycleState, program: Program, now: Date = new Date()): number {
  if (program.schedule === 'sequential' || state.completedSessions != null)
    return Math.floor(completedSessionsOf(state, program) / sessionsPerWeekOf(program))
  if (state.week != null) return state.week
  return Math.max(0, Math.floor(differenceInCalendarDays(now, fromISODate(state.startDate)) / 7))
}

/** The labelled block containing a program week (0-based). */
export function blockFor(program: Program, week: number | undefined) {
  if (week == null) return undefined
  return program.blocks?.find((b) => week >= b.fromWeek && week <= b.toWeek)
}

export interface ScheduledDay {
  program: Program
  sequential: boolean
  day?: ProgramDay
  /** Index of `day` in `program.days` (-1 when none) */
  dayIndex: number
  /** Raw 0-based program week; undefined for programs without weeks */
  week?: number
  /** Week whose prescriptions apply (clamped to the program) */
  prescriptionWeek?: number
  /** Finished sessions in the cycle (sequential programs) */
  completedSessions: number
  /** 0-based position of the next session within its program week */
  sessionInWeek: number
  sessionsPerWeek: number
  /** The current week is the program's test week («Тест») */
  isTestWeek: boolean
  /** All program weeks are done: time to test maxes (optional) and restart */
  isComplete: boolean
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
  const week = weeks ? cycleWeek(state, program, now) : undefined
  const spw = sessionsPerWeekOf(program)
  const completed = completedSessionsOf(state, program)
  const prescriptionWeek = weeks && week != null ? Math.min(week, weeks - 1) : undefined
  return {
    program,
    sequential,
    day: dayIndex >= 0 ? program.days[dayIndex] : undefined,
    dayIndex,
    week,
    prescriptionWeek,
    completedSessions: completed,
    sessionInWeek: completed % spw,
    sessionsPerWeek: spw,
    isTestWeek: !!blockFor(program, week)?.test,
    isComplete: !!weeks && week != null && week >= weeks,
    state,
  }
}

export async function getCycleState(database: FormaDB, programId: string): Promise<ProgramCycleState | undefined> {
  return asCycleState((await database.settings.get(cycleKey(programId)))?.value)
}

/** Next/today's day of a program plus its program week. Safe inside `useLiveQuery`. */
export async function getScheduledDay(
  database: FormaDB,
  program: Program,
  now: Date = new Date(),
): Promise<ScheduledDay> {
  return resolveSchedule(program, await getCycleState(database, program.id), now)
}

type LabelInput = Pick<
  ScheduledDay,
  'program' | 'week' | 'isTestWeek' | 'isComplete' | 'sessionInWeek' | 'sessionsPerWeek'
>

/** «Неделя 3 из 12» / «Неделя 9 из 12 (тест)» / «Программа пройдена»; undefined without weeks. */
export function weekLabel(s: Pick<ScheduledDay, 'program' | 'week' | 'isTestWeek' | 'isComplete'>): string | undefined {
  const weeks = s.program.weeks
  if (!weeks || s.week == null) return undefined
  if (s.isComplete) return `Программа пройдена (${weeks} нед.)`
  return `Неделя ${s.week + 1} из ${weeks}${s.isTestWeek ? ' (тест)' : ''}`
}

/** «Неделя 3 из 12 · тренировка 2 из 3»; undefined for programs without weeks. */
export function scheduleLabel(s: LabelInput): string | undefined {
  const w = weekLabel(s)
  if (!w) return undefined
  if (s.isComplete) return w
  return `${w} · тренировка ${s.sessionInWeek + 1} из ${s.sessionsPerWeek}`
}

/** «Неделя 3 из 12 · Жим 1» for the Today card. */
export function todayLabel(s: ScheduledDay): string | undefined {
  const w = weekLabel(s)
  return w && s.day ? `${w} · ${s.day.name}` : w
}

/** Label of a session started from a cyclic program: «Неделя 3 из 12 · тренировка 2 из 3». */
export function sessionCycleLabel(
  program: Program | undefined,
  session: { programWeek?: number; programSession?: number },
): string | undefined {
  if (!program?.weeks || session.programWeek == null) return undefined
  const spw = sessionsPerWeekOf(program)
  const week = session.programSession != null ? Math.floor(session.programSession / spw) : session.programWeek
  const base = {
    program,
    week: Math.min(week, program.weeks - 1),
    isTestWeek: !!blockFor(program, session.programWeek)?.test,
    isComplete: false,
    sessionsPerWeek: spw,
    sessionInWeek: session.programSession != null ? session.programSession % spw : 0,
  }
  return session.programSession != null ? scheduleLabel(base) : weekLabel(base)
}

/**
 * State after finishing a session of `dayId` (pure, sequential programs only): the finished session is
 * counted and the rotation continues after the day that was done (normally the scheduled one).
 * Returns null when the program does not rotate or the day is unknown.
 */
export function advanceCycle(
  program: Program,
  stored: ProgramCycleState | undefined,
  dayId: string | undefined,
  now: Date = new Date(),
): ProgramCycleState | null {
  if (program.schedule !== 'sequential' || program.days.length === 0) return null
  const idx = program.days.findIndex((d) => d.id === dayId)
  if (idx < 0) return null
  const state = stored ?? defaultCycleState(now)
  const next: ProgramCycleState = {
    startDate: state.startDate,
    completedSessions: completedSessionsOf(state, program) + 1,
    nextDayIndex: (idx + 1) % program.days.length,
  }
  return next
}

export async function setCycleState(database: FormaDB, programId: string, state: ProgramCycleState) {
  await database.settings.put({ key: cycleKey(programId), value: state })
}

/** Manual week choice (0-based): the session counter jumps to the start of that week; the rotation is kept. */
export async function setCycleWeek(database: FormaDB, program: Program, week: number, now: Date = new Date()) {
  const cur = (await getCycleState(database, program.id)) ?? defaultCycleState(now)
  await setCycleState(database, program.id, {
    startDate: cur.startDate,
    completedSessions: Math.max(0, week) * sessionsPerWeekOf(program),
    nextDayIndex: cur.nextDayIndex ?? 0,
  })
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
