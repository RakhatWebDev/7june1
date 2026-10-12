import type { FormaDB } from '../../db'
import type { Program, ProgramDay, ProgramExercise } from '../../db/types'

/* ------------------------------------------------------------------ */
/* Per-program exercise replacements («Заменить в программе»).         */
/* settings 'program.overrides:<programId>' =                          */
/*   { [dayId]: { [exerciseIndex]: { exerciseId, name } } }            */
/* ------------------------------------------------------------------ */

export interface ExerciseOverride {
  exerciseId: string
  name: string
}
export type ProgramOverrides = Record<string, Record<string, ExerciseOverride>>

export const overridesKey = (programId: string) => `program.overrides:${programId}`

export const REPLACED_NOTE = 'Замена:'

export function asOverrides(value: unknown): ProgramOverrides {
  const out: ProgramOverrides = {}
  if (!value || typeof value !== 'object') return out
  for (const [dayId, byIdx] of Object.entries(value as Record<string, unknown>)) {
    if (!byIdx || typeof byIdx !== 'object') continue
    for (const [idx, o] of Object.entries(byIdx as Record<string, unknown>)) {
      const v = o as Partial<ExerciseOverride> | null
      if (v && typeof v.exerciseId === 'string' && typeof v.name === 'string')
        (out[dayId] ??= {})[idx] = { exerciseId: v.exerciseId, name: v.name }
    }
  }
  return out
}

export async function getOverrides(database: FormaDB, programId: string): Promise<ProgramOverrides> {
  return asOverrides((await database.settings.get(overridesKey(programId)))?.value)
}

export async function setOverride(
  database: FormaDB,
  programId: string,
  dayId: string,
  exerciseIndex: number,
  override: ExerciseOverride | null,
) {
  await database.transaction('rw', database.settings, async () => {
    const all = await getOverrides(database, programId)
    const day = { ...(all[dayId] ?? {}) }
    if (override) day[String(exerciseIndex)] = override
    else delete day[String(exerciseIndex)]
    if (Object.keys(day).length) all[dayId] = day
    else delete all[dayId]
    await database.settings.put({ key: overridesKey(programId), value: all })
  })
}

/**
 * Applies an override to one program exercise: new id and name, «Замена: <оригинал>» note.
 * %-targets stay only when the new exercise has its own max (`hasMax`); otherwise the scheme becomes reps-only.
 */
export function overrideExercise(
  e: ProgramExercise,
  o: ExerciseOverride,
  hasMax: (id: string) => boolean,
): ProgramExercise {
  const keepPct = hasMax(o.exerciseId)
  const strip = <T extends { scheme?: { reps: string; pct?: number; note?: string }[]; intensity?: string }>(
    w: T,
  ): T =>
    keepPct || !w.scheme?.some((t) => t.pct != null)
      ? w
      : { ...w, intensity: undefined, scheme: w.scheme.map(({ reps, note }) => (note ? { reps, note } : { reps })) }
  const replaced: ProgramExercise = {
    ...strip(e),
    exerciseId: o.exerciseId,
    name: o.name,
    maxLiftId: undefined,
    notes: [`${REPLACED_NOTE} ${e.name}`, e.notes].filter(Boolean).join(' · '),
    ...(e.weekly ? { weekly: e.weekly.map(strip) } : {}),
  }
  return replaced
}

/** A day with its overrides applied (exercise indices refer to the original day). */
export function applyDayOverrides(
  day: ProgramDay,
  overrides: Record<string, ExerciseOverride> | undefined,
  hasMax: (id: string) => boolean,
): ProgramDay {
  if (!overrides || Object.keys(overrides).length === 0) return day
  return {
    ...day,
    exercises: day.exercises.map((e, i) =>
      overrides[String(i)] ? overrideExercise(e, overrides[String(i)], hasMax) : e,
    ),
  }
}

export function applyProgramOverrides(
  program: Program,
  overrides: ProgramOverrides,
  hasMax: (id: string) => boolean,
): Program {
  if (Object.keys(overrides).length === 0) return program
  return { ...program, days: program.days.map((d) => applyDayOverrides(d, overrides[d.id], hasMax)) }
}
