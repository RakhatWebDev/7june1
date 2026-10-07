import { db as defaultDb, type FormaDB } from '../../db'
import type { SessionExercise, SetLog, WorkoutSession } from '../../db/types'
import { newId } from '../../lib/id'
import { buildSessionFromDay, emptySets, isStartableDay } from './calc'

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

/**
 * Creates a session from a program day and returns its id. If an active session already exists,
 * returns that one instead (only one active session at a time). Runs in a single rw transaction,
 * so concurrent calls (e.g. StrictMode double effects) cannot create two sessions.
 */
export async function startSession(
  programId: string,
  dayId: string,
  database: FormaDB = defaultDb,
  now: Date = new Date(),
): Promise<string> {
  return database.transaction('rw', database.sessions, database.programs, async () => {
    const active = await findActiveSession(database)
    if (active) return active.id
    const program = await database.programs.get(programId)
    if (!program) throw new StartSessionError('Программа не найдена')
    const day = program.days.find((d) => d.id === dayId)
    if (!day) throw new StartSessionError('День программы не найден')
    if (!isStartableDay(day)) throw new StartSessionError('Это день отдыха — тренировку начать нельзя')
    const session = buildSessionFromDay(program, day, newId(), now)
    await database.sessions.add(session)
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

export function updateSet(sessionId: string, exIdx: number, setIdx: number, patch: Partial<SetLog>, database?: FormaDB) {
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

export function finishSession(id: string, database: FormaDB = defaultDb, now: Date = new Date()) {
  return database.sessions.update(id, { finishedAt: now.toISOString() })
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
