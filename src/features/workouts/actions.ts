import { db as defaultDb, type FormaDB } from '../../db'
import type { Exercise, SessionExercise, SetLog, WorkoutSession } from '../../db/types'
import {
  asMaxes,
  asTrainingMaxLog,
  MAXES_KEY,
  TRAINING_MAX_LOG_KEY,
  TRAINING_MAXES_KEY,
} from '../../data/programs/maxes'
import { clearNextSessionNote, getNextSessionNotes } from '../coach/tools'
import { newId } from '../../lib/id'
import { computeNextTargets } from './autoreg'
import { buildSessionFromDay, emptySets, isStartableDay } from './calc'
import { advanceCycle, asCycleState, cycleKey, resolveSchedule, setCycleState } from './schedule'

/* ------------------------------------------------------------------ */
/* DB writes for the workouts feature. Every change is persisted       */
/* immediately so an unfinished session survives a page reload.       */
/* ------------------------------------------------------------------ */

export const ACTIVE_PROGRAM_KEY = 'activeProgramId'
export const HIDE_MEDIA_KEY = 'session.hideMedia'

/** The unfinished session (no `finishedAt`), newest first. At most one should exist. */
export async function findActiveSession(database: FormaDB = defaultDb): Promise<WorkoutSession | undefined> {
  return database.sessions
    .orderBy('startedAt')
    .reverse()
    .filter((s) => !s.finishedAt)
    .first()
}

export class StartSessionError extends Error {}

export { TRAINING_MAX_LOG_KEY } from '../../data/programs/maxes'

interface HistoryEntry {
  sessionId: string
  exercise: SessionExercise
}

/**
 * Last ≤ 3 finished performances of an exercise, newest first. For the same program day the entry with the
 * same occurrence is used (a day may hold the exercise twice); `preferSameDay` puts the newest same-day
 * performance first (accessories), otherwise strictly newest first (%-lifts share one training max).
 */
export function recentPerformances(
  finished: WorkoutSession[],
  exerciseId: string,
  opts: { dayId?: string; occurrence?: number; preferSameDay?: boolean } = {},
): HistoryEntry[] {
  const entries: (HistoryEntry & { sameDay: boolean })[] = []
  for (const s of finished) {
    const list = s.exercises.filter((e) => e.exerciseId === exerciseId)
    if (list.length === 0) continue
    const sameDay = !!opts.dayId && s.programDayId === opts.dayId
    const exercise = sameDay ? (list[opts.occurrence ?? 0] ?? list[0]) : list[0]
    entries.push({ sessionId: s.id, exercise, sameDay })
  }
  if (opts.preferSameDay) {
    const i = entries.findIndex((e) => e.sameDay)
    if (i > 0) entries.unshift(...entries.splice(i, 1))
  }
  return entries.slice(0, 3)
}

/**
 * Creates a session from a program day and returns its id. If an active session already exists,
 * returns that one instead (only one active session at a time). Runs in a single rw transaction,
 * so concurrent calls (e.g. StrictMode double effects) cannot create two sessions.
 *
 * Cyclic programs: the prescription of the current cycle week is used and each exercise gets per-set
 * `targets` + a `hint` from auto-regulation (training max for %-lifts, double progression otherwise).
 * `library` (optional) refines the accessory increment. Coach notes (`coach.nextNotes`) are added to the hint
 * and cleared when the session is finished.
 */
export async function startSession(
  programId: string,
  dayId: string,
  database: FormaDB = defaultDb,
  now: Date = new Date(),
  library?: Map<string, Exercise>,
): Promise<string> {
  return database.transaction('rw', database.sessions, database.programs, database.settings, async () => {
    const active = await findActiveSession(database)
    if (active) return active.id
    const program = await database.programs.get(programId)
    if (!program) throw new StartSessionError('Программа не найдена')
    const day = program.days.find((d) => d.id === dayId)
    if (!day) throw new StartSessionError('День программы не найден')
    if (!isStartableDay(day)) throw new StartSessionError('Это день отдыха — тренировку начать нельзя')

    const [cycleSetting, maxesSetting, tmSetting, logSetting] = await Promise.all([
      database.settings.get(cycleKey(program.id)),
      database.settings.get(MAXES_KEY),
      database.settings.get(TRAINING_MAXES_KEY),
      database.settings.get(TRAINING_MAX_LOG_KEY),
    ])
    const schedule = resolveSchedule(program, asCycleState(cycleSetting?.value), now)
    const week = schedule.prescriptionWeek
    const maxes = asMaxes(maxesSetting?.value)
    const trainingMaxes = asMaxes(tmSetting?.value)
    const log = asTrainingMaxLog(logSetting?.value)
    const coachNotes = await getNextSessionNotes(database)
    let tmChanged = false

    const finished = (await database.sessions.filter((s) => !!s.finishedAt).toArray()).sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    )
    const seen = new Map<string, number>()

    const session = buildSessionFromDay(program, day, newId(), now, {
      week,
      programSession: schedule.sequential ? schedule.completedSessions : undefined,
      extras: (e, prescription) => {
        const occurrence = seen.get(e.exerciseId) ?? 0
        seen.set(e.exerciseId, occurrence + 1)
        const percent = (prescription.scheme ?? []).some((t) => t.pct != null)
        const history = recentPerformances(finished, e.exerciseId, {
          dayId: day.id,
          occurrence,
          preferSameDay: !percent,
        })
        const liftId = e.maxLiftId ?? e.exerciseId
        const lastId = history[0]?.sessionId
        // The same previous session already moved this training max → recompute from the value before it.
        const applied = percent && !!lastId && log[liftId]?.sessionId === lastId
        const tmInput = applied ? { ...trainingMaxes, [liftId]: log[liftId].prevKg } : trainingMaxes
        const r = computeNextTargets({
          programExercise: e,
          week,
          prescription,
          history: history.map((h) => h.exercise),
          maxes,
          trainingMaxes: tmInput,
          library: library?.get(e.exerciseId),
        })
        if (r.trainingMaxUpdate && !applied) {
          const prev = trainingMaxes[liftId] ?? maxes[liftId]
          trainingMaxes[liftId] = r.trainingMaxUpdate.kg
          if (lastId && r.trend !== 'none' && prev != null) log[liftId] = { sessionId: lastId, prevKg: prev }
          tmChanged = true
        }
        // A coach note for this exercise («в следующий раз …») is appended to the auto-regulation hint.
        const note = coachNotes[e.exerciseId]?.note
        const hint = [r.hint, note ? `Тренер: ${note}` : ''].filter(Boolean).join(' · ')
        return { targets: r.targets, hint }
      },
    })
    await database.sessions.add(session)
    if (tmChanged) {
      await database.settings.put({ key: TRAINING_MAXES_KEY, value: trainingMaxes })
      await database.settings.put({ key: TRAINING_MAX_LOG_KEY, value: log })
    }
    return session.id
  })
}

/** Read-modify-write of a session inside a transaction. */
export async function mutateSession(
  id: string,
  fn: (s: WorkoutSession) => void,
  database: FormaDB = defaultDb,
): Promise<void> {
  await database.transaction('rw', database.sessions, async () => {
    const s = await database.sessions.get(id)
    if (!s) return
    fn(s)
    await database.sessions.put(s)
  })
}

export function updateSet(
  sessionId: string,
  exIdx: number,
  setIdx: number,
  patch: Partial<SetLog>,
  database?: FormaDB,
) {
  return mutateSession(
    sessionId,
    (s) => {
      const set = s.exercises[exIdx]?.sets[setIdx]
      if (set) Object.assign(set, patch)
    },
    database,
  )
}

/** Adds a set copying weight/reps of the last one (not done). */
export function addSet(sessionId: string, exIdx: number, database?: FormaDB) {
  return mutateSession(
    sessionId,
    (s) => {
      const ex = s.exercises[exIdx]
      if (!ex) return
      const last = ex.sets[ex.sets.length - 1]
      ex.sets.push({ weightKg: last?.weightKg ?? null, reps: last?.reps ?? null, done: false })
    },
    database,
  )
}

export function removeSet(sessionId: string, exIdx: number, setIdx: number, database?: FormaDB) {
  return mutateSession(sessionId, (s) => void s.exercises[exIdx]?.sets.splice(setIdx, 1), database)
}

export function addExercise(
  sessionId: string,
  ex: Pick<SessionExercise, 'exerciseId' | 'name'> & Partial<SessionExercise>,
  database?: FormaDB,
) {
  const targetSets = ex.targetSets ?? 3
  const entry: SessionExercise = {
    exerciseId: ex.exerciseId,
    name: ex.name,
    targetSets,
    targetReps: ex.targetReps ?? '8-12',
    restSec: ex.restSec ?? 90,
    sets: ex.sets ?? emptySets(targetSets),
  }
  return mutateSession(sessionId, (s) => void s.exercises.push(entry), database)
}

export function removeExercise(sessionId: string, exIdx: number, database?: FormaDB) {
  return mutateSession(sessionId, (s) => void s.exercises.splice(exIdx, 1), database)
}

/** Fills weights of not-yet-done sets from a previous performance (by set index, else last weight). */
export function applyPreviousWeights(sessionId: string, exIdx: number, weights: number[], database?: FormaDB) {
  return mutateSession(
    sessionId,
    (s) => {
      const ex = s.exercises[exIdx]
      if (!ex || weights.length === 0) return
      ex.sets.forEach((set, i) => {
        if (set.done) return
        set.weightKg = weights[i] ?? weights[weights.length - 1]
      })
    },
    database,
  )
}

/**
 * Marks the session finished. For `sequential` programs, finishing the scheduled day advances the
 * rotation (`nextDayIndex`, and the week on wrap). Consumed coach notes are cleared.
 */
export function finishSession(id: string, database: FormaDB = defaultDb, now: Date = new Date()) {
  return database.transaction('rw', database.sessions, database.programs, database.settings, async () => {
    const s = await database.sessions.get(id)
    if (!s) return
    const firstFinish = !s.finishedAt
    await database.sessions.update(id, { finishedAt: now.toISOString() })
    if (!firstFinish) return
    // Coach notes shown in this session are consumed (notes written during the session stay for the next one).
    const notes = await getNextSessionNotes(database)
    for (const id of new Set(s.exercises.map((e) => e.exerciseId)))
      if (notes[id] && notes[id].createdAt <= s.startedAt) await clearNextSessionNote(database, id)
    if (!s.programId) return
    const program = await database.programs.get(s.programId)
    if (!program) return
    const stored = asCycleState((await database.settings.get(cycleKey(program.id)))?.value)
    const next = advanceCycle(program, stored, s.programDayId, now)
    if (next) await setCycleState(database, program.id, next)
  })
}

export function deleteSession(id: string, database: FormaDB = defaultDb) {
  return database.sessions.delete(id)
}

export function setActiveProgram(programId: string, database: FormaDB = defaultDb) {
  return database.settings.put({ key: ACTIVE_PROGRAM_KEY, value: programId })
}

export function setHideMedia(hidden: boolean, database: FormaDB = defaultDb) {
  return database.settings.put({ key: HIDE_MEDIA_KEY, value: hidden })
}
