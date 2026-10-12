import type { Exercise } from '../../db/types'
import { filterExercises } from './calc'

/* ------------------------------------------------------------------ */
/* Browsing the library by muscle group and equipment (Russian).       */
/* ------------------------------------------------------------------ */

export type MuscleGroupId =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'legs'
  | 'abs'
  | 'cardio'

export interface MuscleGroup {
  id: MuscleGroupId
  label: string
  /** free-exercise-db primary muscles of the group (empty for «Кардио», matched by category) */
  muscles: string[]
}

export const MUSCLE_GROUPS: MuscleGroup[] = [
  { id: 'chest', label: 'Грудь', muscles: ['chest'] },
  { id: 'back', label: 'Спина', muscles: ['lats', 'middle back', 'lower back', 'traps', 'neck'] },
  { id: 'shoulders', label: 'Плечи', muscles: ['shoulders'] },
  { id: 'biceps', label: 'Бицепс', muscles: ['biceps'] },
  { id: 'triceps', label: 'Трицепс', muscles: ['triceps'] },
  { id: 'forearms', label: 'Предплечья', muscles: ['forearms'] },
  {
    id: 'legs',
    label: 'Ноги',
    muscles: ['quadriceps', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves'],
  },
  { id: 'abs', label: 'Пресс', muscles: ['abdominals'] },
  { id: 'cardio', label: 'Кардио', muscles: [] },
]

const CARDIO_CATEGORIES = new Set<Exercise['category']>(['cardio', 'plyometrics'])

export type EquipmentGroupId = 'barbell' | 'dumbbell' | 'machine' | 'body' | 'cable' | 'kettlebell' | 'other'

export interface EquipmentGroup {
  id: EquipmentGroupId
  label: string
  /** EQUIPMENT_RU keys; `null` = everything not listed in the other groups */
  equipment: string[] | null
}

export const EQUIPMENT_GROUPS: EquipmentGroup[] = [
  { id: 'barbell', label: 'Штанга', equipment: ['barbell', 'e-z curl bar'] },
  { id: 'dumbbell', label: 'Гантели', equipment: ['dumbbell'] },
  { id: 'machine', label: 'Тренажёр', equipment: ['machine'] },
  { id: 'body', label: 'Собственный вес', equipment: ['body only'] },
  { id: 'cable', label: 'Блок', equipment: ['cable'] },
  { id: 'kettlebell', label: 'Гиря', equipment: ['kettlebells'] },
  { id: 'other', label: 'Другое', equipment: null },
]

const LISTED_EQUIPMENT = new Set(EQUIPMENT_GROUPS.flatMap((g) => g.equipment ?? []))

export function equipmentGroupOf(e: Exercise): EquipmentGroupId {
  if (!e.equipment || !LISTED_EQUIPMENT.has(e.equipment)) return 'other'
  return EQUIPMENT_GROUPS.find((g) => g.equipment?.includes(e.equipment!))!.id
}

/** Whether `e` belongs to the muscle group (stretches are never listed; cardio/plyometrics only in «Кардио»). */
export function inMuscleGroup(e: Exercise, group: MuscleGroupId): boolean {
  if (e.category === 'stretching') return false
  if (group === 'cardio') return CARDIO_CATEGORIES.has(e.category)
  if (CARDIO_CATEGORIES.has(e.category)) return false
  const muscles = MUSCLE_GROUPS.find((g) => g.id === group)!.muscles
  return e.primaryMuscles.some((m) => muscles.includes(m))
}

/** Main group of an exercise (by its first primary muscle), used to preselect the replacement browser. */
export function muscleGroupOf(e: Exercise): MuscleGroupId | null {
  if (CARDIO_CATEGORIES.has(e.category)) return 'cardio'
  const m = e.primaryMuscles[0]
  return MUSCLE_GROUPS.find((g) => g.muscles.includes(m))?.id ?? null
}

export interface BrowseOptions {
  group?: MuscleGroupId | null
  equipment?: EquipmentGroupId | null
  query?: string
  excludeId?: string
  limit?: number
}

/**
 * Library browsing: optional muscle group + equipment filters and a name / Russian alias search.
 * Sorted «popular» first (exercises with a Russian alias from the programs), then with images, then by name.
 */
export function browseExercises(
  library: Exercise[],
  aliases: Map<string, string[]>,
  { group = null, equipment = null, query = '', excludeId, limit = 40 }: BrowseOptions,
): Exercise[] {
  const pool = filterExercises(library, { query }, aliases).filter(
    (e) =>
      e.id !== excludeId &&
      (!group || inMuscleGroup(e, group)) &&
      (!equipment || equipmentGroupOf(e) === equipment),
  )
  const rank = (e: Exercise) => (aliases.has(e.id) ? 2 : 0) + (e.images.length > 0 ? 1 : 0)
  return pool.sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name)).slice(0, limit)
}

/** Equipment groups present among the exercises of a muscle group (for the second chip row). */
export function equipmentGroupsIn(library: Exercise[], group: MuscleGroupId | null): EquipmentGroupId[] {
  const present = new Set(library.filter((e) => !group || inMuscleGroup(e, group)).map(equipmentGroupOf))
  return EQUIPMENT_GROUPS.map((g) => g.id).filter((id) => present.has(id))
}
