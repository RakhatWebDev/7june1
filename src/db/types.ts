/**
 * Domain types stored in IndexedDB (Dexie). Dates:
 *  - `date` fields are calendar days in local time as `YYYY-MM-DD`
 *  - `*At` fields are ISO 8601 timestamps
 * All weights are kilograms, distances kilometres, durations minutes unless stated.
 */

export type ISODate = string // YYYY-MM-DD
export type ISODateTime = string

export type Goal = 'cut' | 'maintain' | 'lean_bulk'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type Sex = 'male' | 'female'

export interface Profile {
  id: 1
  name: string
  sex: Sex
  birthYear: number
  heightCm: number
  weightKg: number
  targetWeightKg?: number
  activityLevel: ActivityLevel
  goal: Goal
  /** Manual override of the computed daily kcal target */
  kcalTargetOverride?: number
  /** Protein g per kg bodyweight, default 2.0 */
  proteinPerKg?: number
  waterTargetMl?: number
  sleepTargetMin?: number
  updatedAt: ISODateTime
}

/** Exercise from the static library (public/data/exercises.json, free-exercise-db). */
export interface Exercise {
  id: string
  name: string
  force: 'push' | 'pull' | 'static' | null
  level: 'beginner' | 'intermediate' | 'expert'
  mechanic: 'compound' | 'isolation' | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category:
    | 'strength'
    | 'stretching'
    | 'plyometrics'
    | 'powerlifting'
    | 'olympic weightlifting'
    | 'strongman'
    | 'cardio'
  /** Relative paths like "Barbell_Squat/0.jpg" — resolve with exerciseImageUrl() */
  images: string[]
}

export type DayType = 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full' | 'arms' | 'rest'

export interface ProgramExercise {
  exerciseId: string
  /** Display name; may differ from the library name (e.g. "Yates Row") */
  name: string
  sets: number
  /** Rep prescription, free text: "5", "3-5", "8-12", "AMRAP" */
  reps: string
  restSec?: number
  /** Target intensity, e.g. "85% 1RM", "RPE 8" */
  intensity?: string
  notes?: string
}

export interface ProgramDay {
  id: string
  name: string
  type: DayType
  /** 0 = Monday … 6 = Sunday, when the program fixes a weekday */
  weekday?: number
  exercises: ProgramExercise[]
  notes?: string
}

export interface Program {
  id: string
  name: string
  description: string
  /** Attribution and caveats, markdown allowed */
  source?: string
  daysPerWeek: number
  days: ProgramDay[]
  isBuiltIn: boolean
  createdAt: ISODateTime
}

export interface SetLog {
  weightKg: number | null
  reps: number | null
  rpe?: number | null
  done: boolean
  /** Warm-up sets are excluded from volume and PRs */
  warmup?: boolean
}

export interface SessionExercise {
  exerciseId: string
  name: string
  targetSets: number
  targetReps: string
  restSec?: number
  sets: SetLog[]
  notes?: string
}

export interface WorkoutSession {
  id: string
  programId?: string
  programDayId?: string
  name: string
  startedAt: ISODateTime
  finishedAt?: ISODateTime
  exercises: SessionExercise[]
  notes?: string
  /** Subjective rating 1–5 */
  feeling?: number
}

export type ActivityType =
  | 'run'
  | 'bike'
  | 'swim'
  | 'rope'
  | 'walk'
  | 'stretch'
  | 'hiit'
  | 'other'

export interface Activity {
  id: string
  type: ActivityType
  date: ISODate
  startedAt?: ISODateTime
  durationMin: number
  distanceKm?: number
  /** For jump rope: total jumps */
  count?: number
  avgHr?: number
  kcal?: number
  /** Stretching: ids of library exercises performed */
  exerciseIds?: string[]
  notes?: string
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Food {
  id: string
  name: string
  /** Per 100 g (or per 100 ml) */
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  /** Default serving in grams for quick add */
  servingG?: number
  isBuiltIn?: boolean
}

export interface FoodEntry {
  id: string
  date: ISODate
  meal: MealType
  foodId?: string
  name: string
  grams: number
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  createdAt: ISODateTime
}

export interface WaterEntry {
  id: string
  date: ISODate
  ml: number
  createdAt: ISODateTime
}

export interface WeightEntry {
  id: string
  date: ISODate
  weightKg: number
  /** Optional body-fat estimate % */
  bodyFatPct?: number
  notes?: string
}

export interface Measurement {
  id: string
  date: ISODate
  neckCm?: number
  shouldersCm?: number
  chestCm?: number
  waistCm?: number
  hipsCm?: number
  armCm?: number
  forearmCm?: number
  thighCm?: number
  calfCm?: number
}

export interface SleepEntry {
  id: string
  /** The morning you woke up */
  date: ISODate
  bedtime: ISODateTime
  wakeTime: ISODateTime
  /** Minutes asleep; derived from times minus awake time unless set manually */
  durationMin: number
  quality: 1 | 2 | 3 | 4 | 5
  notes?: string
}

/** An event imported from the user's calendar (OneFit bookings, classes, gym slots). */
export interface CalendarEvent {
  /** iCalendar UID (+ recurrence id if any) — stable across re-imports */
  id: string
  title: string
  startAt: ISODateTime
  endAt: ISODateTime
  allDay: boolean
  location?: string
  description?: string
  /** Where it came from: file name or feed URL label */
  source: string
  /** Classified kind for icons/links: gym → link to start a workout, etc. */
  kind: 'gym' | 'swim' | 'class' | 'run' | 'bike' | 'other'
  importedAt: ISODateTime
}

export interface CalendarFeed {
  id: string
  label: string
  url: string
  lastSyncAt?: ISODateTime
  lastError?: string
}

export interface Setting {
  key: string
  value: unknown
}
