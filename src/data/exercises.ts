import { useEffect, useState } from 'react'
import type { Exercise } from '../db/types'

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

/** Absolute URL of an exercise frame; `images` entries look like "Barbell_Squat/0.jpg". */
export function exerciseImageUrl(relative: string): string {
  return IMAGE_BASE + relative
}

let cache: Promise<Exercise[]> | null = null

/** Loads the static exercise library (876 items, ~850 KB) once per page load. */
export function loadExercises(): Promise<Exercise[]> {
  if (!cache) {
    const url = `${import.meta.env.BASE_URL}data/exercises.json`
    cache = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`Failed to load exercises: ${r.status}`)
      return (await r.json()) as Exercise[]
    })
    cache.catch(() => {
      cache = null
    })
  }
  return cache
}

/** Test helper: inject a fixed list instead of fetching. */
export function __setExercisesForTests(list: Exercise[]) {
  cache = Promise.resolve(list)
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  const all = await loadExercises()
  return all.find((e) => e.id === id)
}

export function useExercises(): { exercises: Exercise[]; loading: boolean; error: string | null } {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    loadExercises()
      .then((list) => {
        if (alive) setExercises(list)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])
  return { exercises, loading, error }
}

export function useExercise(id: string | undefined) {
  const { exercises, loading, error } = useExercises()
  return { exercise: id ? exercises.find((e) => e.id === id) : undefined, loading, error }
}

export const MUSCLE_RU: Record<string, string> = {
  abdominals: 'Пресс',
  abductors: 'Отводящие',
  adductors: 'Приводящие',
  biceps: 'Бицепс',
  calves: 'Икры',
  chest: 'Грудь',
  forearms: 'Предплечья',
  glutes: 'Ягодицы',
  hamstrings: 'Бицепс бедра',
  lats: 'Широчайшие',
  'lower back': 'Поясница',
  'middle back': 'Середина спины',
  neck: 'Шея',
  quadriceps: 'Квадрицепс',
  shoulders: 'Плечи',
  traps: 'Трапеции',
  triceps: 'Трицепс',
}

export const EQUIPMENT_RU: Record<string, string> = {
  barbell: 'Штанга',
  dumbbell: 'Гантели',
  'body only': 'Без оборудования',
  cable: 'Блок',
  machine: 'Тренажёр',
  kettlebells: 'Гиря',
  bands: 'Резина',
  'medicine ball': 'Медбол',
  'exercise ball': 'Фитбол',
  'foam roll': 'Ролл',
  'e-z curl bar': 'EZ-гриф',
  other: 'Другое',
}

export const CATEGORY_RU: Record<Exercise['category'], string> = {
  strength: 'Силовые',
  stretching: 'Растяжка',
  plyometrics: 'Плиометрика',
  powerlifting: 'Пауэрлифтинг',
  'olympic weightlifting': 'Тяжёлая атлетика',
  strongman: 'Стронгмен',
  cardio: 'Кардио',
}
