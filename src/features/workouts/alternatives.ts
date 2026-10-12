import type { Exercise } from '../../db/types'

/* ------------------------------------------------------------------ */
/* Exercise alternatives: a curated list for the main lifts first,    */
/* then the library ranked by muscles, force, mechanic and equipment. */
/* ------------------------------------------------------------------ */

/** Hand-picked substitutes (library ids) for the program's main movements, best first. */
export const CURATED_ALTERNATIVES: Record<string, string[]> = {
  Push_Press: [
    'Standing_Military_Press',
    'Seated_Dumbbell_Press',
    'Barbell_Shoulder_Press',
    'Machine_Shoulder_Military_Press',
  ],
  Standing_Military_Press: [
    'Seated_Dumbbell_Press',
    'Push_Press',
    'Seated_Barbell_Military_Press',
    'Machine_Shoulder_Military_Press',
  ],
  Seated_Dumbbell_Press: [
    'Arnold_Dumbbell_Press',
    'Dumbbell_Shoulder_Press',
    'Machine_Shoulder_Military_Press',
    'Standing_Military_Press',
  ],
  Clean_and_Press: ['Push_Press', 'Standing_Military_Press', 'Dumbbell_Shoulder_Press'],
  'Barbell_Bench_Press_-_Medium_Grip': [
    'Dumbbell_Bench_Press',
    'Machine_Bench_Press',
    'Barbell_Incline_Bench_Press_-_Medium_Grip',
    'Smith_Machine_Bench_Press',
  ],
  'Close-Grip_Barbell_Bench_Press': [
    'Dips_-_Triceps_Version',
    'Close-Grip_Dumbbell_Press',
    'Smith_Machine_Close-Grip_Bench_Press',
  ],
  Incline_Dumbbell_Press: [
    'Barbell_Incline_Bench_Press_-_Medium_Grip',
    'Smith_Machine_Incline_Bench_Press',
    'Dumbbell_Bench_Press',
  ],
  'Dips_-_Triceps_Version': ['Close-Grip_Barbell_Bench_Press', 'Bench_Dips', 'Dip_Machine'],
  Pushups: ['Dumbbell_Bench_Press', 'Incline_Push-Up', 'Machine_Bench_Press'],
  Barbell_Squat: ['Leg_Press', 'Front_Barbell_Squat', 'Hack_Squat', 'Smith_Machine_Squat', 'Goblet_Squat'],
  Barbell_Full_Squat: ['Barbell_Squat', 'Front_Barbell_Squat', 'Hack_Squat', 'Leg_Press'],
  Front_Barbell_Squat: ['Barbell_Squat', 'Goblet_Squat', 'Hack_Squat', 'Leg_Press'],
  Leg_Press: ['Hack_Squat', 'Barbell_Squat', 'Smith_Machine_Squat'],
  Barbell_Deadlift: ['Rack_Pulls', 'Romanian_Deadlift', 'Trap_Bar_Deadlift', 'Sumo_Deadlift'],
  Sumo_Deadlift: ['Barbell_Deadlift', 'Trap_Bar_Deadlift', 'Rack_Pulls'],
  Rack_Pulls: ['Barbell_Deadlift', 'Trap_Bar_Deadlift', 'Romanian_Deadlift'],
  Deficit_Deadlift: ['Barbell_Deadlift', 'Romanian_Deadlift', 'Trap_Bar_Deadlift'],
  Weighted_Pull_Ups: ['Wide-Grip_Lat_Pulldown', 'Pullups', 'Chin-Up', 'Close-Grip_Front_Lat_Pulldown'],
  Pullups: ['Wide-Grip_Lat_Pulldown', 'Band_Assisted_Pull-Up', 'Chin-Up', 'Close-Grip_Front_Lat_Pulldown'],
  Bent_Over_Barbell_Row: [
    'T-Bar_Row_with_Handle',
    'One-Arm_Dumbbell_Row',
    'Seated_Cable_Rows',
    'Bent_Over_Two-Dumbbell_Row',
  ],
  'T-Bar_Row_with_Handle': ['Bent_Over_Barbell_Row', 'Seated_Cable_Rows', 'One-Arm_Dumbbell_Row'],
  Barbell_Shrug: ['Dumbbell_Shrug', 'Smith_Machine_Behind_the_Back_Shrug'],
  Dumbbell_Shrug: ['Barbell_Shrug', 'Smith_Machine_Behind_the_Back_Shrug'],
  Side_Lateral_Raise: ['Cable_Seated_Lateral_Raise', 'Seated_Side_Lateral_Raise'],
  Lying_Leg_Curls: ['Seated_Leg_Curl', 'Romanian_Deadlift'],
  Leg_Extensions: ['Single-Leg_Leg_Extension', 'Leg_Press'],
  Dumbbell_Lunges: ['Barbell_Lunge', 'Leg_Press', 'Goblet_Squat'],
  Smith_Machine_Calf_Raise: ['Standing_Calf_Raises', 'Donkey_Calf_Raises', 'Seated_Calf_Raise'],
  Standing_Calf_Raises: ['Smith_Machine_Calf_Raise', 'Donkey_Calf_Raises', 'Seated_Calf_Raise'],
  Seated_Calf_Raise: ['Standing_Calf_Raises', 'Smith_Machine_Calf_Raise'],
}

const TRAINING_CATEGORIES = new Set<Exercise['category']>([
  'strength',
  'powerlifting',
  'olympic weightlifting',
  'strongman',
])

/** Similarity score: shared primary muscles first, then force (push/pull), then mechanic. */
export function similarity(a: Exercise, b: Exercise): number {
  const shared = b.primaryMuscles.filter((m) => a.primaryMuscles.includes(m)).length
  const secondary = b.primaryMuscles.filter((m) => a.secondaryMuscles.includes(m)).length
  return (
    shared * 10 +
    secondary * 2 +
    (a.force && a.force === b.force ? 4 : 0) +
    (a.mechanic && a.mechanic === b.mechanic ? 2 : 0)
  )
}

/**
 * Up to `limit` alternatives for `target`: curated ids first (in their order, if present in the library),
 * then library exercises ranked by `similarity`; among equal scores, equipment the list doesn't have yet
 * comes first (variety). Only training categories; the exercise itself is excluded.
 */
export function rankAlternatives(target: Exercise, library: Exercise[], limit = 8): Exercise[] {
  const byId = new Map(library.map((e) => [e.id, e]))
  const out: Exercise[] = []
  for (const id of CURATED_ALTERNATIVES[target.id] ?? []) {
    const e = byId.get(id)
    if (e && e.id !== target.id && !out.includes(e)) out.push(e)
    if (out.length >= limit) return out
  }
  const pool = library
    .filter((e) => e.id !== target.id && !out.includes(e) && TRAINING_CATEGORIES.has(e.category))
    .map((e) => ({ e, score: similarity(target, e) }))
    .filter((x) => x.score >= 10)
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
  const seenEquipment = new Set(out.map((e) => e.equipment))
  while (out.length < limit && pool.length > 0) {
    const best = pool[0].score
    const sameScore = pool.filter((x) => x.score === best)
    const pick = sameScore.find((x) => !seenEquipment.has(x.e.equipment)) ?? sameScore[0]
    pool.splice(pool.indexOf(pick), 1)
    out.push(pick.e)
    seenEquipment.add(pick.e.equipment)
  }
  return out
}
