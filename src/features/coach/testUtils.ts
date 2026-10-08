import { FormaDB } from '../../db'
import type { Profile, Program, SetLog, WorkoutSession } from '../../db/types'
import { toISODate, weekdayIndex } from '../../lib/dates'
import { computeTargets } from '../nutrition/calc'
import type { CoachData } from './insights'

/* Fixtures for coach tests (not imported by app code). */

let counter = 0
export const freshDb = () => new FormaDB(`test-coach-${Date.now()}-${++counter}`)

/** Local-time ISO timestamp for a calendar day. */
export const at = (date: string, hour = 12, min = 0) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, hour, min).toISOString()
}

export const localDate = (date: string, hour = 12, min = 0) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, hour, min)
}

export const set = (weightKg: number, reps: number, extra: Partial<SetLog> = {}): SetLog => ({
  weightKg,
  reps,
  done: true,
  ...extra,
})

export const profile = (patch: Partial<Profile> = {}): Profile => ({
  id: 1,
  name: 'Тест',
  sex: 'male',
  birthYear: 1996,
  heightCm: 180,
  weightKg: 85,
  targetWeightKg: 80,
  activityLevel: 'moderate',
  goal: 'cut',
  waterTargetMl: 3000,
  sleepTargetMin: 480,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...patch,
})

export const program = (patch: Partial<Program> = {}): Program => ({
  id: 'p1',
  name: 'Тестовая',
  description: '',
  daysPerWeek: 3,
  isBuiltIn: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  days: [
    {
      id: 'legs',
      name: 'Ноги',
      type: 'legs',
      weekday: 0,
      exercises: [
        { exerciseId: 'Barbell_Squat', name: 'Присед', sets: 3, reps: '5' },
        { exerciseId: 'Leg_Extensions', name: 'Разгибания ног', sets: 3, reps: '10-12' },
      ],
    },
    {
      id: 'push',
      name: 'Жим',
      type: 'push',
      weekday: 2,
      exercises: [
        { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Жим лёжа', sets: 3, reps: '6-8' },
        { exerciseId: 'Side_Lateral_Raise', name: 'Махи в стороны', sets: 3, reps: '12-15' },
      ],
    },
    {
      id: 'pull',
      name: 'Тяга',
      type: 'pull',
      weekday: 4,
      exercises: [{ exerciseId: 'Barbell_Deadlift', name: 'Становая', sets: 2, reps: '3-5' }],
    },
    { id: 'rest', name: 'Отдых', type: 'rest', weekday: 6, exercises: [] },
  ],
  ...patch,
})

/** Built-in style rotation: 6 sessions, 3 per week, 12 program weeks, no weekdays. */
export const seqProgram = (patch: Partial<Program> = {}): Program => ({
  id: 'seq',
  name: 'Ротация',
  description: '',
  daysPerWeek: 3,
  sessionsPerWeek: 3,
  weeks: 12,
  schedule: 'sequential',
  isBuiltIn: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  days: [
    { id: 'push1', name: 'Жим 1', type: 'push', exercises: [{ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Жим лёжа', sets: 3, reps: '6-8' }] },
    { id: 'pull1', name: 'Тяга 1', type: 'pull', exercises: [{ exerciseId: 'Barbell_Deadlift', name: 'Становая', sets: 3, reps: '5' }] },
    { id: 'legs1', name: 'Ноги 1', type: 'legs', exercises: [{ exerciseId: 'Barbell_Squat', name: 'Присед', sets: 3, reps: '5' }] },
    { id: 'push2', name: 'Жим 2', type: 'push', exercises: [{ exerciseId: 'Dumbbell_Bench_Press', name: 'Жим гантелей', sets: 3, reps: '8-10' }] },
    { id: 'pull2', name: 'Тяга 2', type: 'pull', exercises: [{ exerciseId: 'Pullups', name: 'Подтягивания', sets: 3, reps: '6-10' }] },
    { id: 'legs2', name: 'Ноги 2', type: 'legs', exercises: [{ exerciseId: 'Leg_Press', name: 'Жим ногами', sets: 3, reps: '10-12' }] },
  ],
  ...patch,
})

export const session = (
  id: string,
  date: string,
  exercises: { exerciseId: string; name?: string; targetReps?: string; sets: SetLog[] }[],
  patch: Partial<WorkoutSession> = {},
): WorkoutSession => ({
  id,
  name: 'Тренировка',
  startedAt: at(date, 18),
  finishedAt: at(date, 19),
  exercises: exercises.map((e) => ({
    exerciseId: e.exerciseId,
    name: e.name ?? e.exerciseId,
    targetSets: e.sets.length,
    targetReps: e.targetReps ?? '5',
    sets: e.sets,
  })),
  ...patch,
})

/** CoachData for pure rule tests; `now` defaults to Wednesday 2026-10-07 10:00. */
export function coachData(patch: Partial<CoachData> = {}): CoachData {
  const now = patch.now ?? localDate('2026-10-07', 10)
  const prof = patch.profile === undefined ? profile() : patch.profile
  const prog = patch.program === undefined ? program() : patch.program
  return {
    now,
    today: toISODate(now),
    hour: now.getHours(),
    profile: prof,
    targets: prof ? computeTargets(prof, prof.weightKg, now) : null,
    program: prog,
    todayDay:
      prog?.schedule === 'sequential' ? (prog.days[0] ?? null) : (prog?.days.find((d) => d.weekday === weekdayIndex(now)) ?? null),
    sequential: prog?.schedule === 'sequential',
    targetPerWeek: 3,
    sessions: [],
    activities: [],
    foodEntries: [],
    foods: [],
    water: [],
    weights: [],
    sleep: [],
    moods: [],
    lifts: {},
    habits: [],
    habitDone: new Map(),
    ...patch,
  }
}
