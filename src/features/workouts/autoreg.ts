import type {
  Exercise,
  Program,
  ProgramExercise,
  ProgramExerciseWeek,
  SessionExercise,
  SetTarget,
  WorkoutSession,
} from '../../db/types'
import { roundToStep } from '../../data/programs/maxes'
import { plural } from '../../lib/format'
import { epley1RM, fmtKg, isWorkingSet } from './calc'

/* ------------------------------------------------------------------ */
/* Auto-regulation: the next session's targets adapt to what was      */
/* actually done last time. Pure functions — no DB access.            */
/*  - %-based lifts: a training max moves ±5 % per session            */
/*  - accessories: double progression (reps first, then weight)       */
/*  - bodyweight / AMRAP: last best + 1 rep                           */
/* Imported by the coach feature as well (../workouts/autoreg).       */
/* ------------------------------------------------------------------ */

export interface TargetSet {
  reps: string
  weightKg?: number
  pct?: number
}

/** ↑ weights went up, ↓ down, = unchanged, none — nothing to compare with yet */
export type Trend = 'up' | 'down' | 'same' | 'none'

export interface NextTargetsInput {
  programExercise: Pick<ProgramExercise, 'exerciseId' | 'name'> & Partial<Pick<ProgramExercise, 'maxLiftId'>>
  /** 0-based cycle week (informational) */
  week?: number
  /** Resolved prescription for the upcoming session (weekly[week] or the base fields) */
  prescription: Pick<ProgramExerciseWeek, 'sets' | 'reps' | 'scheme'>
  /** Last ≤ 3 finished performances of this exercise, newest first */
  history: SessionExercise[]
  /** Tested maxes, Record<exerciseId, kg> */
  maxes: Record<string, number>
  /** Training maxes, Record<exerciseId, kg>; a lift without one starts from its tested max */
  trainingMaxes: Record<string, number>
  /** Library entry — decides the accessory increment (+5 kg lower body, else +2.5 kg) */
  library?: Pick<Exercise, 'primaryMuscles' | 'equipment' | 'mechanic'>
}

export interface NextTargets {
  targets: TargetSet[]
  /** Human explanation, starts with ↑ / ↓ / = when weights changed or stayed; '' when nothing to say */
  hint: string
  trend: Trend
  mode: 'percent' | 'hold' | 'weight' | 'bodyweight'
  /** Training max used for the targets (%-based lifts) */
  trainingMax?: number
  /** New training max to persist (also emitted to seed it from the tested max) */
  trainingMaxUpdate?: { exerciseId: string; kg: number }
}

const STEP = 2.5
const MAX_RAISE = 0.05
const DROP = 0.05

/** Estimated one-rep max (Epley): w × (1 + reps / 30). */
export function estimate1RM(weightKg: number, reps: number): number {
  return epley1RM(weightKg, reps)
}

/** "10" → {10,10}, "10-15" → {10,15}; non-numeric ("AMRAP", "45-60 с") → null. */
export function parseReps(reps: string): { min: number; max: number } | null {
  const m = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(reps)
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] != null ? Number(m[2]) : a
  return { min: Math.min(a, b), max: Math.max(a, b) }
}

/** Per-set targets of a prescription (explicit scheme or `sets` × `reps`). */
export function prescriptionSets(p: Pick<ProgramExerciseWeek, 'sets' | 'reps' | 'scheme'>): SetTarget[] {
  if (p.scheme && p.scheme.length > 0) return p.scheme
  return Array.from({ length: Math.max(0, p.sets) }, () => ({ reps: p.reps }))
}

function lastTargetsOf(e: SessionExercise): TargetSet[] {
  if (e.targets && e.targets.length > 0) return e.targets
  return Array.from({ length: e.targetSets }, () => ({ reps: e.targetReps }))
}

const kgText = (n: number) => fmtKg(n)
const setsWord = (n: number) => plural(n, ['подход', 'подхода', 'подходов'])

const LOWER_MUSCLES = ['quadriceps', 'hamstrings', 'glutes']
const LOWER_PATTERN = /squat|leg_press|lunge|deadlift|rack_pull|good_morning/i

/** +5 kg for leg press / squat / deadlift patterns, +2.5 kg for everything else. */
export function accessoryIncrement(exerciseId: string, library?: NextTargetsInput['library']): number {
  if (library?.mechanic === 'isolation') return STEP
  const lower = library ? library.primaryMuscles.some((m) => LOWER_MUSCLES.includes(m)) : false
  return lower || LOWER_PATTERN.test(exerciseId) ? 5 : STEP
}

/* ------------------------------ %-based ------------------------------ */

function evaluatePercent(last: SessionExercise | undefined, base: number): { tm: number; trend: Trend; hint: string } {
  const tmText = `Тренировочный макс. ${kgText(base)} кг`
  if (!last) return { tm: base, trend: 'none', hint: tmText }
  const lastTargets = lastTargetsOf(last)
  const idx = lastTargets.map((_, i) => i).filter((i) => parseReps(lastTargets[i].reps) != null)
  const done = idx.map((i) => last.sets[i]).filter((s) => s && isWorkingSet(s) && (s.reps ?? 0) > 0)
  if (idx.length === 0 || done.length === 0)
    return {
      tm: base,
      trend: 'same',
      hint: `= ${tmText}: в прошлый раз подходы не отмечены → веса по плану`,
    }

  const missed = idx.filter((i) => {
    const s = last.sets[i]
    const r = parseReps(lastTargets[i].reps)!
    return !s?.done || (s.reps ?? 0) < r.min
  }).length
  if (missed >= 2) {
    let tm = roundToStep(base * (1 - DROP))
    if (tm >= base) tm = base - STEP
    tm = Math.max(STEP, tm)
    return {
      tm,
      trend: 'down',
      hint: `↓ Тренировочный макс. ${kgText(tm)} кг (было ${kgText(base)}): не добрал ${missed} ${setsWord(missed)} → цели снижены`,
    }
  }

  // Top set = the heaviest prescribed one (the last on ties, e.g. 10-8-6 → the 6).
  const top = idx.reduce((a, i) => ((lastTargets[i].weightKg ?? -1) >= (lastTargets[a].weightKg ?? -1) ? i : a), idx[0])
  const topSet = last.sets[top]
  const topTarget = lastTargets[top]
  const topRange = parseReps(topTarget.reps)!
  const beat =
    !!topSet?.done &&
    ((topSet.reps ?? 0) > topRange.max || (topTarget.weightKg != null && (topSet.weightKg ?? 0) > topTarget.weightKg))
  if (beat) {
    const e1rm = Math.max(
      ...idx
        .map((i) => last.sets[i])
        .filter((s) => s && isWorkingSet(s))
        .map((s) => estimate1RM(s.weightKg ?? 0, s.reps ?? 0)),
    )
    // At least one plate step (beating the plan always moves weights up), more when 0.95 × e1RM allows,
    // but never more than +5 % per session (rounded down to the plate step, minimum one step).
    const wanted = Math.max(base + STEP, roundToStep(0.95 * e1rm))
    const cap = Math.max(base + STEP, Math.floor((base * (1 + MAX_RAISE)) / STEP) * STEP)
    const tm = Math.min(wanted, cap)
    if (tm > base) {
      const did = `${topSet.reps} × ${kgText(topSet.weightKg ?? 0)}`
      return {
        tm,
        trend: 'up',
        hint: `↑ Тренировочный макс. ${kgText(tm)} кг (было ${kgText(base)}): в прошлый раз ${did} с запасом → цели выросли`,
      }
    }
  }
  return {
    tm: base,
    trend: 'same',
    hint:
      missed === 1
        ? `= ${tmText}: 1 подход не добран → веса без изменений`
        : `= ${tmText}: план выполнен → веса по плану`,
  }
}

/* ----------------------------- accessories ----------------------------- */

function nextAccessory(input: NextTargetsInput, perSet: SetTarget[]): NextTargets {
  const last = input.history[0]
  const lastDone = last ? last.sets.filter(isWorkingSet) : []
  const plain = perSet.map((t) => ({ reps: t.reps }))
  if (!last || lastDone.length === 0) return { targets: plain, hint: '', trend: 'none', mode: 'weight' }

  const topWeight = Math.max(0, ...lastDone.map((s) => s.weightKg ?? 0))
  const amrap = perSet.every((t) => parseReps(t.reps) == null)
  if (topWeight <= 0 || amrap) {
    const best = Math.max(0, ...lastDone.map((s) => s.reps ?? 0))
    if (best <= 0) return { targets: plain, hint: '', trend: 'none', mode: 'bodyweight' }
    const goal = String(best + 1)
    return {
      targets: perSet.map(() => (topWeight > 0 ? { reps: goal, weightKg: topWeight } : { reps: goal })),
      hint: `↑ цель ${goal} повт.: в прошлый раз лучший подход — ${best}`,
      trend: 'up',
      mode: 'bodyweight',
    }
  }

  // Per-set weights of last time (pyramids keep their shape), falling back to the nearest known weight.
  const lastWeights: number[] = []
  let carry = lastDone.find((s) => (s.weightKg ?? 0) > 0)?.weightKg ?? topWeight
  for (let i = 0; i < Math.max(perSet.length, last.sets.length); i++) {
    const s = last.sets[i]
    if (s && isWorkingSet(s) && (s.weightKg ?? 0) > 0) carry = s.weightKg ?? carry
    lastWeights.push(carry)
  }

  const lastTargets = lastTargetsOf(last)
  const allTop = lastTargets.every((t, i) => {
    const s = last.sets[i]
    const r = parseReps(t.reps)
    return !!s?.done && (!r || (s.reps ?? 0) >= r.max)
  })
  const short = lastTargets.filter((t, i) => {
    const s = last.sets[i]
    const r = parseReps(t.reps)
    return !s?.done || (r != null && (s.reps ?? 0) <= r.min - 2)
  }).length

  if (allTop) {
    const inc = accessoryIncrement(input.programExercise.exerciseId, input.library)
    const targets = perSet.map((t, i) => {
      const r = parseReps(t.reps)
      return { reps: r ? String(r.min) : t.reps, weightKg: lastWeights[i] + inc }
    })
    const top = Math.max(...targets.map((t) => t.weightKg))
    return {
      targets,
      hint: `↑ +${kgText(inc)} кг: все подходы выполнены → ${kgText(top)} кг`,
      trend: 'up',
      mode: 'weight',
    }
  }
  if (short >= 2) {
    const targets = perSet.map((t, i) => {
      let w = roundToStep(lastWeights[i] * (1 - DROP))
      if (w >= lastWeights[i]) w = lastWeights[i] - STEP
      return w > 0 ? { reps: t.reps, weightKg: w } : { reps: t.reps }
    })
    const top = Math.max(0, ...targets.map((t) => t.weightKg ?? 0))
    return {
      targets,
      hint: `↓ снизили: не добрал ${short} ${setsWord(short)} → ${kgText(top)} кг`,
      trend: 'down',
      mode: 'weight',
    }
  }
  const targets = perSet.map((t, i) => {
    const r = parseReps(t.reps)
    let reps = t.reps
    if (r && r.max > r.min) {
      const s = last.sets[i]
      const did = s?.done ? (s.reps ?? r.min) : r.min - 1
      reps = String(Math.min(r.max, Math.max(r.min, did + 1)))
    }
    return { reps, weightKg: lastWeights[i] }
  })
  return {
    targets,
    hint: `= повтори вес ${kgText(Math.max(...targets.map((t) => t.weightKg)))} кг, добери повторы`,
    trend: 'same',
    mode: 'weight',
  }
}

/* ------------------------------- entry ------------------------------- */

/**
 * Targets for the next session of one exercise. Reps of %-schemes never change — only the weights
 * (through the training max). Accessories use double progression.
 */
export function computeNextTargets(input: NextTargetsInput): NextTargets {
  const perSet = prescriptionSets(input.prescription)
  if (!perSet.some((t) => t.pct != null)) return nextAccessory(input, perSet)

  const liftId = input.programExercise.maxLiftId ?? input.programExercise.exerciseId
  const stored = input.trainingMaxes[liftId]
  const base = stored ?? input.maxes[liftId]
  const hold = perSet.every((t) => t.pct == null || parseReps(t.reps) == null)
  const mode = hold ? 'hold' : 'percent'
  if (base == null || !(base > 0))
    return {
      targets: perSet.map((t) => (t.pct != null ? { reps: t.reps, pct: t.pct } : { reps: t.reps })),
      hint: 'Укажи максимум в программе («Мои максимумы»), чтобы рассчитать веса',
      trend: 'none',
      mode,
    }

  const ev = hold
    ? {
        tm: base,
        trend: 'none' as Trend,
        hint: `Удержание: ${pctLabel(perSet)} от тренировочного макс. ${kgText(base)} кг`,
      }
    : evaluatePercent(input.history[0], base)
  const targets = perSet.map((t) =>
    t.pct != null ? { reps: t.reps, pct: t.pct, weightKg: roundToStep(t.pct * ev.tm) } : { reps: t.reps },
  )
  const out: NextTargets = { targets, hint: ev.hint, trend: ev.trend, mode, trainingMax: ev.tm }
  if (ev.tm !== stored) out.trainingMaxUpdate = { exerciseId: liftId, kg: ev.tm }
  return out
}

function pctLabel(perSet: SetTarget[]): string {
  const p = perSet.find((t) => t.pct != null)?.pct ?? 1
  return `${Math.round(p * 100)} %`
}

/* --------------------------- session helpers --------------------------- */

/** Program exercise of a session's day by exercise id (first match with `maxLiftId` preferred). */
export function programExerciseFor(
  program: Program | undefined,
  dayId: string | undefined,
  exerciseId: string,
): ProgramExercise | undefined {
  const day = program?.days.find((d) => d.id === dayId)
  const all = day?.exercises.filter((e) => e.exerciseId === exerciseId) ?? []
  return all.find((e) => e.maxLiftId) ?? all[0]
}

export interface MaxSuggestion {
  liftId: string
  label: string
  kg: number
  prev?: number
}

/**
 * MAX / heavy-single exercises (a numeric target at ≥ 95 %) whose best completed set beats the stored max:
 * «Новый максимум: присед 65 кг — сохранить?».
 */
export function maxUpdateSuggestions(
  session: WorkoutSession,
  program: Program | undefined,
  maxes: Record<string, number>,
): MaxSuggestion[] {
  const out = new Map<string, MaxSuggestion>()
  for (const ex of session.exercises) {
    const test = (ex.targets ?? []).some((t) => (t.pct ?? 0) >= 0.95 && parseReps(t.reps) != null)
    if (!test) continue
    const best = Math.max(
      0,
      ...ex.sets.filter((s) => isWorkingSet(s) && (s.reps ?? 0) >= 1).map((s) => s.weightKg ?? 0),
    )
    const liftId = programExerciseFor(program, session.programDayId, ex.exerciseId)?.maxLiftId ?? ex.exerciseId
    const prev = maxes[liftId]
    if (best <= 0 || (prev != null && best <= prev)) continue
    const label = program?.maxLifts?.find((m) => m.exerciseId === liftId)?.label ?? ex.name
    const cur = out.get(liftId)
    if (!cur || best > cur.kg) out.set(liftId, { liftId, label, kg: best, prev })
  }
  return [...out.values()]
}

export interface NextPreview {
  name: string
  kg: number
  trend: Trend
}

/**
 * «Следующий раз: присед 52,5 кг (↑), жим 60 кг (=)» — the top target weight of each exercise if the same
 * prescription came again, computed as if this session were the latest.
 */
export function nextTimePreview(
  session: WorkoutSession,
  allSessions: WorkoutSession[],
  program: Program | undefined,
  maxes: Record<string, number>,
  trainingMaxes: Record<string, number>,
  library: Map<string, Exercise> = new Map(),
): NextPreview[] {
  const out: NextPreview[] = []
  const older = allSessions
    .filter((s) => s.finishedAt && s.id !== session.id && s.startedAt < session.startedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const seen = new Set<string>()
  for (const ex of session.exercises) {
    if (!ex.sets.some(isWorkingSet)) continue
    const key = `${ex.exerciseId}|${ex.name}`
    if (seen.has(key)) continue
    seen.add(key)
    const pe = programExerciseFor(program, session.programDayId, ex.exerciseId)
    const history = [
      ex,
      ...older
        .map((s) => s.exercises.find((e) => e.exerciseId === ex.exerciseId))
        .filter((e): e is SessionExercise => !!e)
        .slice(0, 2),
    ]
    const r = computeNextTargets({
      programExercise: { exerciseId: ex.exerciseId, name: ex.name, maxLiftId: pe?.maxLiftId },
      prescription: {
        sets: ex.targetSets,
        reps: ex.targetReps,
        scheme: ex.targets?.map((t) => (t.pct != null ? { reps: t.reps, pct: t.pct } : { reps: t.reps })),
      },
      history,
      maxes,
      trainingMaxes,
      library: library.get(ex.exerciseId),
    })
    if (r.mode === 'hold') continue
    const kg = Math.max(0, ...r.targets.map((t) => t.weightKg ?? 0))
    if (kg <= 0) continue
    out.push({ name: ex.name, kg, trend: r.trend === 'none' ? 'same' : r.trend })
  }
  return out
}

export const TREND_ARROW: Record<Trend, string> = { up: '↑', down: '↓', same: '=', none: '=' }

/** Tone of a stored hint by its leading arrow. */
export function hintTrend(hint: string | undefined): Trend {
  if (!hint) return 'none'
  if (hint.startsWith('↑')) return 'up'
  if (hint.startsWith('↓')) return 'down'
  if (hint.startsWith('=')) return 'same'
  return 'none'
}
