import type {
  Exercise,
  Program,
  ProgramDay,
  ProgramExercise,
  ProgramExerciseWeek,
  SessionExercise,
  SetLog,
  WorkoutSession,
} from '../../db/types'

/* ------------------------------------------------------------------ */
/* Pure workout calculations. No DB access here — easy to unit test.  */
/* ------------------------------------------------------------------ */

/** A set counts towards volume / PRs only when completed and not a warm-up. */
export function isWorkingSet(s: SetLog): boolean {
  return s.done && !s.warmup
}

/** Volume of one set = weightKg × reps for done, non-warm-up sets; 0 otherwise. */
export function setVolume(s: SetLog): number {
  if (!isWorkingSet(s)) return 0
  return (s.weightKg ?? 0) * (s.reps ?? 0)
}

export function exerciseVolume(e: SessionExercise): number {
  return e.sets.reduce((sum, s) => sum + setVolume(s), 0)
}

export function sessionVolume(session: Pick<WorkoutSession, 'exercises'>): number {
  return session.exercises.reduce((sum, e) => sum + exerciseVolume(e), 0)
}

/** Number of completed working sets in a session. */
export function doneSetCount(session: Pick<WorkoutSession, 'exercises'>): number {
  return session.exercises.reduce((n, e) => n + e.sets.filter(isWorkingSet).length, 0)
}

/** Estimated one-rep max, Epley: w × (1 + reps / 30). */
export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0
  return weightKg * (1 + reps / 30)
}

/** Session duration in minutes; an active session is measured up to `now`. */
export function sessionDurationMin(
  session: Pick<WorkoutSession, 'startedAt' | 'finishedAt'>,
  now: Date = new Date(),
): number {
  const start = Date.parse(session.startedAt)
  const end = session.finishedAt ? Date.parse(session.finishedAt) : now.getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, Math.round((end - start) / 60000))
}

/** Seconds → "m:ss" */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** Kilograms with a Russian decimal comma and no trailing zeros: 82.5 → "82,5". */
export function fmtKg(n: number): string {
  return String(Number(n.toFixed(2))).replace('.', ',')
}

/* --------------------------- program days --------------------------- */

/** Program day scheduled on a Monday-based weekday (0 = Monday … 6 = Sunday). */
export function scheduledDay(program: Program, weekday: number): ProgramDay | undefined {
  return program.days.find((d) => d.weekday === weekday)
}

/** A day can be started only if it has exercises and is not a rest day. */
export function isStartableDay(day: ProgramDay): boolean {
  return day.type !== 'rest' && day.exercises.length > 0
}

export function emptySets(n: number): SetLog[] {
  return Array.from({ length: Math.max(0, n) }, () => ({ weightKg: null, reps: null, done: false }))
}

/**
 * The prescription of a program exercise for a 0-based cycle week: `weekly[week]` when the program is
 * cyclic, else the base fields. `week` beyond the cycle uses the last week.
 */
export function weekPrescription(e: ProgramExercise, week?: number): ProgramExerciseWeek {
  if (e.weekly && e.weekly.length > 0 && week != null) {
    const w = e.weekly[Math.min(Math.max(0, week), e.weekly.length - 1)]
    if (w) return w
  }
  const base: ProgramExerciseWeek = { sets: e.sets, reps: e.reps }
  if (e.intensity) base.intensity = e.intensity
  if (e.scheme) base.scheme = e.scheme
  return base
}

/** Extra per-exercise fields (targets, hint) resolved by the caller, e.g. auto-regulation. */
export type ExerciseExtras = (
  e: ProgramExercise,
  prescription: ProgramExerciseWeek,
  index: number,
) => Partial<Pick<SessionExercise, 'targets' | 'hint'>> | undefined

/**
 * Builds a new session from a program day: copies the plan (for `week` of a cyclic program) and creates
 * empty set logs. Exercises with 0 sets this week are skipped.
 */
export function buildSessionFromDay(
  program: Program,
  day: ProgramDay,
  id: string,
  now: Date = new Date(),
  opts: { week?: number; programSession?: number; extras?: ExerciseExtras } = {},
): WorkoutSession {
  const cyclic = program.weeks != null && opts.week != null
  const exercises: SessionExercise[] = []
  day.exercises.forEach((e, i) => {
    const w = weekPrescription(e, cyclic ? opts.week : undefined)
    if (w.sets <= 0) return
    const notes = [e.notes, w.notes].filter(Boolean).join(' ')
    const extra = opts.extras?.(e, w, i) ?? {}
    exercises.push({
      exerciseId: e.exerciseId,
      name: e.name,
      targetSets: w.sets,
      targetReps: w.reps,
      restSec: e.restSec,
      sets: emptySets(w.sets),
      ...(notes ? { notes } : {}),
      ...(extra.targets ? { targets: extra.targets } : {}),
      ...(extra.hint ? { hint: extra.hint } : {}),
    })
  })
  return {
    id,
    programId: program.id,
    programDayId: day.id,
    ...(cyclic ? { programWeek: opts.week } : {}),
    ...(cyclic && opts.programSession != null ? { programSession: opts.programSession } : {}),
    name: day.name,
    startedAt: now.toISOString(),
    exercises,
  }
}

/* ---------------------------- history / PRs ---------------------------- */

export interface PastPerformance {
  sessionId: string
  startedAt: string
  sets: { weightKg: number; reps: number }[]
}

function doneSets(e: SessionExercise): { weightKg: number; reps: number }[] {
  return e.sets
    .filter((s) => isWorkingSet(s) && s.reps != null && s.reps > 0)
    .map((s) => ({ weightKg: s.weightKg ?? 0, reps: s.reps ?? 0 }))
}

/**
 * The most recent finished session (other than `excludeSessionId`) in which the exercise was performed.
 * When a session contains the same exercise several times (e.g. heavy + volume squats) we match the
 * `occurrence`-th entry, falling back to the first one.
 */
export function lastPerformance(
  sessions: WorkoutSession[],
  exerciseId: string,
  opts: { excludeSessionId?: string; occurrence?: number; before?: string } = {},
): PastPerformance | null {
  const candidates = sessions
    .filter((s) => s.finishedAt && s.id !== opts.excludeSessionId)
    .filter((s) => !opts.before || s.startedAt < opts.before)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  for (const s of candidates) {
    const entries = s.exercises.filter((e) => e.exerciseId === exerciseId)
    if (entries.length === 0) continue
    const entry = entries[opts.occurrence ?? 0] ?? entries[0]
    let sets = doneSets(entry)
    if (sets.length === 0) sets = entries.flatMap(doneSets)
    if (sets.length === 0) continue
    return { sessionId: s.id, startedAt: s.startedAt, sets }
  }
  return null
}

/** "80 кг × 5, 5, 5" or "80 кг × 5, 5 · 82,5 кг × 3" (consecutive equal weights grouped). */
export function formatPerformance(sets: { weightKg: number; reps: number }[]): string {
  const groups: { w: number; reps: number[] }[] = []
  for (const s of sets) {
    const last = groups[groups.length - 1]
    if (last && last.w === s.weightKg) last.reps.push(s.reps)
    else groups.push({ w: s.weightKg, reps: [s.reps] })
  }
  return groups.map((g) => `${g.w > 0 ? `${fmtKg(g.w)} кг` : 'б/в'} × ${g.reps.join(', ')}`).join(' · ')
}

/** Which entry (0-based) among same-exercise entries the given index is. */
export function occurrenceIndex(exercises: SessionExercise[], index: number): number {
  const id = exercises[index]?.exerciseId
  let n = 0
  for (let i = 0; i < index; i++) if (exercises[i].exerciseId === id) n++
  return n
}

export interface ExerciseBest {
  maxWeightKg: number
  maxWeightDate: string | null
  best1RM: number
  best1RMDate: string | null
}

/** Best weight and best Epley 1RM per exercise over the given sessions (working sets only). */
export function bestByExercise(sessions: WorkoutSession[]): Map<string, ExerciseBest> {
  const out = new Map<string, ExerciseBest>()
  for (const s of sessions) {
    for (const e of s.exercises) {
      for (const set of e.sets) {
        if (!isWorkingSet(set) || !set.weightKg || !set.reps || set.reps <= 0) continue
        const cur = out.get(e.exerciseId) ?? {
          maxWeightKg: 0,
          maxWeightDate: null,
          best1RM: 0,
          best1RMDate: null,
        }
        if (set.weightKg > cur.maxWeightKg) {
          cur.maxWeightKg = set.weightKg
          cur.maxWeightDate = s.startedAt
        }
        const orm = epley1RM(set.weightKg, set.reps)
        if (orm > cur.best1RM) {
          cur.best1RM = orm
          cur.best1RMDate = s.startedAt
        }
        out.set(e.exerciseId, cur)
      }
    }
  }
  return out
}

export interface NewRecord {
  exerciseId: string
  name: string
  weightKg?: { value: number; prev: number }
  oneRM?: { value: number; prev: number }
}

/**
 * Records set in `session` compared with all *other* sessions started before it.
 * The very first time an exercise is logged is not a record (nothing to beat).
 */
export function newRecords(session: WorkoutSession, allSessions: WorkoutSession[]): NewRecord[] {
  const earlier = allSessions.filter((s) => s.id !== session.id && s.startedAt < session.startedAt)
  const prev = bestByExercise(earlier)
  const cur = bestByExercise([session])
  const records: NewRecord[] = []
  for (const [exerciseId, best] of cur) {
    const before = prev.get(exerciseId)
    if (!before) continue
    const rec: NewRecord = {
      exerciseId,
      name: session.exercises.find((e) => e.exerciseId === exerciseId)?.name ?? exerciseId,
    }
    if (best.maxWeightKg > before.maxWeightKg) rec.weightKg = { value: best.maxWeightKg, prev: before.maxWeightKg }
    if (best.best1RM > before.best1RM + 1e-9) rec.oneRM = { value: best.best1RM, prev: before.best1RM }
    if (rec.weightKg || rec.oneRM) records.push(rec)
  }
  return records
}

export interface ExerciseHistoryItem {
  sessionId: string
  sessionName: string
  startedAt: string
  sets: { weightKg: number; reps: number }[]
}

/** Latest `limit` sessions (newest first) in which the exercise has completed working sets. */
export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string, limit = 10): ExerciseHistoryItem[] {
  return [...sessions]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((s) => ({
      sessionId: s.id,
      sessionName: s.name,
      startedAt: s.startedAt,
      sets: s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap(doneSets),
    }))
    .filter((h) => h.sets.length > 0)
    .slice(0, limit)
}

/* ---------------------------- library search ---------------------------- */

export interface ExerciseFilter {
  query?: string
  muscle?: string | null
  equipment?: string | null
  category?: Exercise['category'] | null
}

/**
 * Case-insensitive search by library name (and optional Russian aliases), plus exact-match filters.
 * `muscle` matches primary muscles only, so "chest" lists chest exercises rather than everything touching it.
 */
export function filterExercises(
  list: Exercise[],
  f: ExerciseFilter,
  aliases: Map<string, string[]> = new Map(),
): Exercise[] {
  const q = (f.query ?? '').trim().toLowerCase()
  return list.filter((e) => {
    if (f.muscle && !e.primaryMuscles.includes(f.muscle)) return false
    if (f.equipment && e.equipment !== f.equipment) return false
    if (f.category && e.category !== f.category) return false
    if (!q) return true
    if (e.name.toLowerCase().includes(q)) return true
    return (aliases.get(e.id) ?? []).some((a) => a.toLowerCase().includes(q))
  })
}

/** exerciseId → display names used in programs (Russian), de-duplicated. */
export function buildAliasMap(programs: Program[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const p of programs)
    for (const d of p.days)
      for (const e of d.exercises) {
        const list = map.get(e.exerciseId) ?? []
        if (!list.includes(e.name)) list.push(e.name)
        map.set(e.exerciseId, list)
      }
  return map
}
