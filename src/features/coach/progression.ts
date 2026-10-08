import type { Program, SessionExercise, WorkoutSession } from '../../db/types'
import { computeNextTargets, programExerciseFor } from '../workouts/autoreg'
import { bestSet, e1rm, fmtKg, parseRepRange, round, setsVolume, workSets, type WorkSet } from './util'

/* Rule 1 — double progression, shared by the insights engine and SessionReviewCard. */

export type ProgressionAction = 'increase' | 'repeat' | 'decrease' | 'hold'

export interface ProgressionAdvice {
  exerciseId: string
  name: string
  action: ProgressionAction
  currentKg: number
  nextKg: number
  /** Short Russian explanation ("все подходы на верхней границе 8–12") */
  reason: string
  sets: WorkSet[]
  /** Full auto-regulation hint ("↑ +2,5 кг: все подходы выполнены → 82,5 кг"), same text the session shows */
  hint?: string
  /** %-based lifts: the training max moves instead of a single weight */
  trainingMax?: { from: number; to: number }
}

const LOWER_BODY =
  /squat|deadlift|leg|lunge|calf|hip|glute|romanian|good_morning|step.?up|присед|станов|ног|выпад|икр|ягодиц|румынск|жим ногами/i

/** Lower-body lifts progress in 5 kg steps, everything else in 2.5 kg. */
export function isLowerBody(exerciseId: string, name = ''): boolean {
  return LOWER_BODY.test(exerciseId) || LOWER_BODY.test(name)
}

/** Round a load to a plate-friendly step: 2.5 kg for barbell loads, 0.5 kg for light ones. */
export function roundLoad(kg: number): number {
  return kg >= 20 ? Math.round(kg / 2.5) * 2.5 : round(Math.round(kg * 2) / 2, 1)
}

const rangeLabel = (r: { min: number; max: number }) => (r.min === r.max ? `${r.max}` : `${r.min}–${r.max}`)

/** Sets that missed the bottom of the rep range, plus prescribed sets that were never completed. */
export function failedSetCount(ex: SessionExercise): number {
  const range = parseRepRange(ex.targetReps)
  if (!range) return 0
  const sets = workSets(ex.sets)
  return sets.filter((s) => s.reps < range.min).length + Math.max(0, ex.targetSets - sets.length)
}

/**
 * Next-time load for one exercise:
 *  - every prescribed set at the top of the rep range (or all sets in range with RPE ≤ 8) → +2.5 kg upper / +5 kg lower;
 *  - ≥ 2 failed sets → repeat the weight, or −5 % if the previous time also failed;
 *  - otherwise hold the weight and add reps.
 * Returns null for unweighted exercises or free-text prescriptions such as AMRAP.
 */
export function progressionAdvice(ex: SessionExercise, previous?: SessionExercise | null): ProgressionAdvice | null {
  const range = parseRepRange(ex.targetReps)
  const sets = workSets(ex.sets)
  if (!range || sets.length === 0) return null
  const currentKg = Math.max(...sets.map((s) => s.weightKg))
  if (currentKg <= 0) return null
  const base = { exerciseId: ex.exerciseId, name: ex.name, currentKg, sets }
  const complete = sets.length >= ex.targetSets
  const allTop = complete && sets.every((s) => s.reps >= range.max)
  const easy = complete && sets.every((s) => s.reps >= range.min && s.rpe != null && s.rpe <= 8)
  if (allTop || easy) {
    const step = isLowerBody(ex.exerciseId, ex.name) ? 5 : 2.5
    return {
      ...base,
      action: 'increase',
      nextKg: currentKg + step,
      reason: allTop
        ? `все ${sets.length} подх. на верхней границе (${rangeLabel(range)} повт.)`
        : 'все подходы в диапазоне с запасом (RPE ≤ 8)',
    }
  }
  const failed = failedSetCount(ex)
  if (failed >= 2) {
    const prevFailed = previous ? failedSetCount(previous) >= 2 : false
    if (prevFailed) {
      return { ...base, action: 'decrease', nextKg: roundLoad(currentKg * 0.95), reason: `${failed} подх. ниже ${range.min} повт. второй раз подряд` }
    }
    return { ...base, action: 'repeat', nextKg: currentKg, reason: `${failed} подх. ниже ${range.min} повт.` }
  }
  return { ...base, action: 'hold', nextKg: currentKg, reason: `добирай повторы до ${range.max}` }
}

/** Short Russian label of the advice: "100 → 105 кг", "повтори 80 кг", "−5 %: 76 кг". */
export function adviceLabel(a: ProgressionAdvice): string {
  if (a.trainingMax && a.trainingMax.from !== a.trainingMax.to) return `ТМ ${fmtKg(a.trainingMax.from)} → ${fmtKg(a.trainingMax.to)} кг`
  switch (a.action) {
    case 'increase':
      return `${fmtKg(a.currentKg)} → ${fmtKg(a.nextKg)} кг`
    case 'decrease':
      return `−5 %: ${fmtKg(a.nextKg)} кг`
    case 'repeat':
      return `повтори ${fmtKg(a.currentKg)} кг`
    default:
      return `${fmtKg(a.currentKg)} кг, +повторы`
  }
}

/** Note text saved via add_note_to_next_session. */
export function adviceNote(a: ProgressionAdvice): string {
  if (a.hint) return a.hint
  const verb =
    a.action === 'increase'
      ? `Поставь ${fmtKg(a.nextKg)} кг`
      : a.action === 'decrease'
        ? `Сбрось до ${fmtKg(a.nextKg)} кг (−5 %)`
        : a.action === 'repeat'
          ? `Повтори ${fmtKg(a.currentKg)} кг`
          : `Останься на ${fmtKg(a.currentKg)} кг`
  return `${verb}: ${a.reason}.`
}

/* ------------------------------ session review ------------------------------ */

export interface ExerciseReview {
  exerciseId: string
  name: string
  volumeKg: number
  prevVolumeKg: number | null
  best: WorkSet | null
  prevBest: WorkSet | null
  /** True when the best e1RM beats every earlier session */
  isPR: boolean
  advice: ProgressionAdvice | null
}

/** Exercise entry of the latest finished session started before `before`. */
export function previousEntry(
  sessions: WorkoutSession[],
  exerciseId: string,
  before: string,
  excludeId?: string,
): SessionExercise | null {
  const prev = sessions
    .filter((s) => s.finishedAt && s.id !== excludeId && s.startedAt < before)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  for (const s of prev) {
    const entry = s.exercises.find((e) => e.exerciseId === exerciseId && workSets(e.sets).length > 0)
    if (entry) return entry
  }
  return null
}

/** Per-exercise comparison of a session with the previous time and with all-time bests. */
export function reviewSession(session: WorkoutSession, all: WorkoutSession[], lifts: LiftContext = {}): ExerciseReview[] {
  const earlier = all.filter((s) => s.id !== session.id && s.finishedAt && s.startedAt < session.startedAt)
  const seen = new Set<string>()
  const out: ExerciseReview[] = []
  for (const ex of session.exercises) {
    if (seen.has(ex.exerciseId)) continue
    seen.add(ex.exerciseId)
    const entries = session.exercises.filter((e) => e.exerciseId === ex.exerciseId)
    const sets = entries.flatMap((e) => workSets(e.sets))
    if (sets.length === 0) continue
    const prev = previousEntry(earlier, ex.exerciseId, session.startedAt)
    const prevSets = prev ? workSets(prev.sets) : []
    const best = bestSet(sets)
    const allPrev = earlier.flatMap((s) => s.exercises.filter((e) => e.exerciseId === ex.exerciseId).flatMap((e) => workSets(e.sets)))
    const prevMax = Math.max(0, ...allPrev.map((s) => e1rm(s.weightKg, s.reps)))
    out.push({
      exerciseId: ex.exerciseId,
      name: ex.name,
      volumeKg: round(setsVolume(sets)),
      prevVolumeKg: prev ? round(setsVolume(prevSets)) : null,
      best,
      prevBest: bestSet(prevSets),
      isPR: !!best && allPrev.length > 0 && e1rm(best.weightKg, best.reps) > prevMax + 1e-9,
      advice: adviseNext(ex, prev, { ...lifts, sessionId: session.id, maxLiftId: programExerciseFor(lifts.program, session.programDayId, ex.exerciseId)?.maxLiftId }),
    })
  }
  return out
}


/* ------------------------- auto-regulation adapter ------------------------- */

/** Settings keys of the workouts auto-regulation (see src/data/programs/maxes.ts and workouts/actions.ts). */
export const MAXES_KEY = 'lifts.maxes'
export const TRAINING_MAXES_KEY = 'lifts.trainingMaxes'
export const TRAINING_MAX_LOG_KEY = 'lifts.trainingMaxes.log'

export interface LiftContext {
  /** Tested maxes, exerciseId → kg */
  maxes?: Record<string, number>
  /** Auto-regulated training maxes, exerciseId → kg */
  trainingMaxes?: Record<string, number>
  /** liftId → the session whose result already moved that training max */
  tmLog?: Record<string, { sessionId: string; prevKg: number }>
  /** Program of the session (for `maxLiftId`) */
  program?: Program
}

/** Sanitise a stored Record<string, number> (positive numbers only). */
export function asKgRecord(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === 'number' && x > 0) out[k] = x
  return out
}

export function asTmLog(v: unknown): NonNullable<LiftContext['tmLog']> {
  const out: NonNullable<LiftContext['tmLog']> = {}
  if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v as Record<string, { sessionId?: unknown; prevKg?: unknown }>))
      if (x && typeof x.sessionId === 'string' && typeof x.prevKg === 'number') out[k] = { sessionId: x.sessionId, prevKg: x.prevKg }
  return out
}

const ACTION_BY_TREND = { up: 'increase', down: 'decrease', same: 'hold' } as const

/**
 * Rule 1 as used by the insights engine and SessionReviewCard: delegates to the workouts
 * auto-regulation (`computeNextTargets`) so the brief and the next session's targets never
 * disagree. `ex` is the latest performance, `previous` the one before it.
 */
export function adviseNext(
  ex: SessionExercise,
  previous?: SessionExercise | null,
  ctx: LiftContext & { sessionId?: string; maxLiftId?: string } = {},
): ProgressionAdvice | null {
  const sets = workSets(ex.sets)
  if (sets.length === 0) return null
  const currentKg = Math.max(...sets.map((s) => s.weightKg))
  const liftId = ctx.maxLiftId ?? ex.exerciseId
  const maxes = ctx.maxes ?? {}
  const stored = ctx.trainingMaxes ?? {}
  // This very session already moved the training max (next session was started) → evaluate from the value before it.
  const logged = ctx.sessionId ? ctx.tmLog?.[liftId] : undefined
  const trainingMaxes = logged && logged.sessionId === ctx.sessionId ? { ...stored, [liftId]: logged.prevKg } : stored
  const r = computeNextTargets({
    programExercise: { exerciseId: ex.exerciseId, name: ex.name, ...(ctx.maxLiftId ? { maxLiftId: ctx.maxLiftId } : {}) },
    prescription: {
      sets: ex.targetSets,
      reps: ex.targetReps,
      ...(ex.targets?.length ? { scheme: ex.targets.map((t) => (t.pct != null ? { reps: t.reps, pct: t.pct } : { reps: t.reps })) } : {}),
    },
    history: previous ? [ex, previous] : [ex],
    maxes,
    trainingMaxes,
  })
  if (r.trend === 'none' || r.mode === 'hold' || r.mode === 'bodyweight') return null
  const nextKg = Math.max(0, ...r.targets.map((t) => t.weightKg ?? 0))
  if (nextKg <= 0 || currentKg <= 0) return null
  const base = trainingMaxes[liftId] ?? maxes[liftId]
  return {
    exerciseId: ex.exerciseId,
    name: ex.name,
    action: ACTION_BY_TREND[r.trend],
    currentKg,
    nextKg,
    reason: r.hint.replace(/^[↑↓=]\s*/, ''),
    sets,
    hint: r.hint,
    ...(r.mode === 'percent' && r.trainingMax != null && base != null ? { trainingMax: { from: base, to: r.trainingMax } } : {}),
  }
}
