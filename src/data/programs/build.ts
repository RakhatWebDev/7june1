import type { ProgramExercise, ProgramExerciseWeek, SetTarget } from '../../db/types'

/**
 * Builders for cyclic programs (David Laid's documents). A week is encoded as
 * `{ sets, reps, intensity, scheme }`; `scheme[i]` is the target of set i (reps + optional % of max).
 */

/** Recommended %-of-max per rep count, from David Laid's "Workout_Program_1". */
export const DAVID_LAID_PCT_TABLE: Record<string, number> = {
  '10': 0.6,
  '8': 0.7,
  '6': 0.8,
  '5': 0.8,
  '4': 0.85,
  '3': 0.9,
  '2': 0.92,
  '1': 0.95,
}

const pctOf = (reps: number): number | undefined => DAVID_LAID_PCT_TABLE[String(reps)]
const pctText = (pcts: (number | undefined)[]) =>
  pcts.every((p) => p != null) ? `${pcts.map((p) => Math.round((p ?? 0) * 100)).join('/')} % от макс.` : undefined

/** "10-8-6"-style descending sets. Core lifts get % of max from the table, accessories don't. */
export function pyramid(reps: number[], core = false): ProgramExerciseWeek {
  const pcts = reps.map((r) => (core ? pctOf(r) : undefined))
  const scheme: SetTarget[] = reps.map((r, i) =>
    pcts[i] != null ? { reps: String(r), pct: pcts[i] } : { reps: String(r) },
  )
  const week: ProgramExerciseWeek = { sets: reps.length, reps: reps.join('-'), scheme }
  if (core) week.intensity = pctText(pcts)
  return week
}

/** "4x10"-style straight sets. Core lifts get % of max from the table. */
export function straight(sets: number, reps: number | string, core = false): ProgramExerciseWeek {
  const pct = core && typeof reps === 'number' ? pctOf(reps) : undefined
  const r = String(reps)
  const week: ProgramExerciseWeek = {
    sets,
    reps: r,
    scheme: Array.from({ length: sets }, () => (pct != null ? { reps: r, pct } : { reps: r })),
  }
  if (pct != null) week.intensity = `${Math.round(pct * 100)} % от макс.`
  return week
}

/** "Heavy single" followed by straight sets (PPL week 1: "Heavy Single … 4x10"). */
export function singlePlus(sets: number, reps: number, core = true): ProgramExerciseWeek {
  const rest = straight(sets, reps, core)
  return {
    sets: sets + 1,
    reps: `1 + ${sets}×${reps}`,
    intensity: `сингл 95 %${rest.intensity ? `, затем ${rest.intensity}` : ''}`,
    scheme: [{ reps: '1', pct: 0.95, note: 'тяжёлый сингл' }, ...(rest.scheme ?? [])],
  }
}

export const MAX_NOTE = 'работай до нового максимума (шаг до 10 кг при >80 %)'

/** "MAX" — one top single at 100 % of the current max (work up to a new max). */
export function maxTest(): ProgramExerciseWeek {
  return {
    sets: 1,
    reps: '1',
    intensity: 'MAX',
    scheme: [{ reps: '1', pct: 1, note: MAX_NOTE }],
    notes: `MAX: ${MAX_NOTE}`,
  }
}

/** "Heavy Single" — 1 × 1 at 95 %. */
export function heavySingle(): ProgramExerciseWeek {
  return {
    sets: 1,
    reps: '1',
    intensity: 'тяжёлый сингл, 95 %',
    scheme: [{ reps: '1', pct: 0.95, note: 'тяжёлый сингл' }],
  }
}

/** "to failure, 2 sets" */
export function toFailure(sets = 2): ProgramExerciseWeek {
  return {
    sets,
    reps: 'AMRAP',
    intensity: 'до отказа',
    scheme: Array.from({ length: sets }, () => ({ reps: 'AMRAP' })),
  }
}

/** Static holds: 3 × 45–60 s at 120 % of the squat max. */
export function staticHold(): ProgramExerciseWeek {
  const note = 'сними штангу и держи наверху 45–60 с'
  return {
    sets: 3,
    reps: '45-60 с',
    intensity: '120 % от макс.',
    scheme: Array.from({ length: 3 }, () => ({ reps: '45-60 с', pct: 1.2, note })),
  }
}

/** The exercise is not done this week (kept so every `weekly` array has the cycle length). */
export function skip(): ProgramExerciseWeek {
  return { sets: 0, reps: '—', notes: 'На этой неделе не выполняется' }
}

export const times = (w: ProgramExerciseWeek, n = 4): ProgramExerciseWeek[] =>
  Array.from({ length: n }, () => ({ ...w }))

/** A cyclic program exercise; the base fields mirror the first week that has sets. */
export function cyc(
  exerciseId: string,
  name: string,
  weekly: ProgramExerciseWeek[],
  opts: { restSec?: number; notes?: string; maxLiftId?: string } = {},
): ProgramExercise {
  const base = weekly.find((w) => w.sets > 0) ?? weekly[0]
  const e: ProgramExercise = {
    exerciseId,
    name,
    sets: base.sets,
    reps: base.reps,
    restSec: opts.restSec ?? 90,
    weekly,
  }
  if (base.intensity) e.intensity = base.intensity
  if (base.scheme) e.scheme = base.scheme
  if (opts.notes) e.notes = opts.notes
  if (opts.maxLiftId) e.maxLiftId = opts.maxLiftId
  return e
}
