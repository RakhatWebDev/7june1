import type { FormaDB } from '../../db'

/*
 * Lift maxes (1RM, kg) used by %-based programs.
 *  - `lifts.maxes`          — tested maxes, Record<exerciseId, kg>; edited by the user / saved after a MAX day
 *  - `lifts.trainingMaxes`  — auto-regulated working maxes (start = tested max), see features/workouts/autoreg.ts
 */

export const MAXES_KEY = 'lifts.maxes'
export const TRAINING_MAXES_KEY = 'lifts.trainingMaxes'
/**
 * liftId → the finished session whose result last moved that training max and the value before it
 * (`{ sessionId, prevKg }`); keeps training-max updates idempotent across repeated session starts.
 */
export const TRAINING_MAX_LOG_KEY = 'lifts.trainingMaxes.log'
export type TrainingMaxLog = Record<string, { sessionId: string; prevKg: number }>

export function asTrainingMaxLog(v: unknown): TrainingMaxLog {
  if (!v || typeof v !== 'object') return {}
  const out: TrainingMaxLog = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const e = x as { sessionId?: unknown; prevKg?: unknown } | null
    if (e && typeof e.sessionId === 'string' && typeof e.prevKg === 'number')
      out[k] = { sessionId: e.sessionId, prevKg: e.prevKg }
  }
  return out
}
/** settings.activeProgramId — same key as features/workouts/actions ACTIVE_PROGRAM_KEY */
const ACTIVE_PROGRAM_KEY = 'activeProgramId'

export const DEFAULT_ACTIVE_PROGRAM_ID = 'david-laid-program-1'

/** Rakhat's tested maxes from his personalised David Laid document. */
export const DEFAULT_MAXES: Record<string, number> = {
  Barbell_Squat: 60,
  'Barbell_Bench_Press_-_Medium_Grip': 60,
  Barbell_Deadlift: 70,
}

export type Maxes = Record<string, number>

/** Sanitises a stored settings value into `Record<exerciseId, kg>` (positive numbers only). */
export function asMaxes(value: unknown): Maxes {
  const out: Maxes = {}
  if (!value || typeof value !== 'object') return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>))
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v
  return out
}

/** Rounds to the nearest plate step (2.5 kg by default). */
export function roundToStep(kg: number, step = 2.5): number {
  return Math.round(kg / step) * step
}

/** Suggested working weight = pct × max rounded to 2.5 kg; undefined without a max. */
export function suggestedKg(pct: number | undefined, max: number | undefined): number | undefined {
  if (pct == null || max == null || max <= 0) return undefined
  return roundToStep(pct * max)
}

/**
 * Seeds program settings on first run (each only when absent):
 * tested maxes and the default active program (David Laid — Program 1).
 */
export async function ensureProgramSettingsSeeded(database: FormaDB): Promise<void> {
  await database.transaction('rw', database.settings, async () => {
    if (!(await database.settings.get(MAXES_KEY)))
      await database.settings.put({ key: MAXES_KEY, value: { ...DEFAULT_MAXES } })
    if (!(await database.settings.get(ACTIVE_PROGRAM_KEY)))
      await database.settings.put({ key: ACTIVE_PROGRAM_KEY, value: DEFAULT_ACTIVE_PROGRAM_ID })
  })
}

export async function getMaxes(database: FormaDB): Promise<Maxes> {
  return asMaxes((await database.settings.get(MAXES_KEY))?.value)
}

/** Training maxes with the tested max as the fallback for lifts that have none yet. */
export async function getTrainingMaxes(database: FormaDB): Promise<Maxes> {
  const [maxes, tms] = await Promise.all([getMaxes(database), database.settings.get(TRAINING_MAXES_KEY)])
  return { ...maxes, ...asMaxes(tms?.value) }
}

/**
 * Saves a tested max. `mode: 'set'` (manual edit) resets the training max to it;
 * `mode: 'raise'` (new max hit in a session) only raises the training max.
 */
export async function saveMax(database: FormaDB, liftId: string, kg: number | null, mode: 'set' | 'raise' = 'set') {
  await database.transaction('rw', database.settings, async () => {
    const maxes = asMaxes((await database.settings.get(MAXES_KEY))?.value)
    const tms = asMaxes((await database.settings.get(TRAINING_MAXES_KEY))?.value)
    if (kg == null || !(kg > 0)) {
      delete maxes[liftId]
      delete tms[liftId]
    } else {
      maxes[liftId] = kg
      tms[liftId] = mode === 'raise' ? Math.max(tms[liftId] ?? 0, kg) : kg
    }
    await database.settings.put({ key: MAXES_KEY, value: maxes })
    await database.settings.put({ key: TRAINING_MAXES_KEY, value: tms })
  })
}
