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

/* ----------------------------- Development: habits & books ----------------------------- */

/** Rule that lets the app auto-complete a habit from other data for a day. */
export type HabitAutoRule = 'workout' | 'cardio' | 'water' | 'sleep' | 'reading' | 'stretch' | null

export interface Habit {
  id: string
  name: string
  /** Emoji or short glyph */
  icon: string
  /** Tailwind-agnostic colour token name: 'accent' | 'info' | 'warn' | 'danger' | 'violet' | 'pink' */
  color: string
  frequency: 'daily' | 'weekly'
  /** For weekly habits: how many days per week count as success */
  targetPerWeek?: number
  autoRule: HabitAutoRule
  /** Order in lists */
  sort: number
  archived: boolean
  createdAt: ISODateTime
}

export interface HabitLog {
  id: string
  habitId: string
  date: ISODate
  done: boolean
  note?: string
}

export type BookStatus = 'want' | 'reading' | 'done' | 'dropped'

export interface Book {
  id: string
  title: string
  author?: string
  totalPages?: number
  status: BookStatus
  coverUrl?: string
  tags?: string[]
  rating?: 1 | 2 | 3 | 4 | 5
  /** Short review / key takeaways */
  notes?: string
  startedAt?: ISODate
  finishedAt?: ISODate
  createdAt: ISODateTime
}

export interface ReadingLog {
  id: string
  bookId: string
  date: ISODate
  /** Pages read in this session */
  pages: number
  minutes?: number
  /** Quote or thought captured during the session */
  note?: string
  createdAt: ISODateTime
}

/* ----------------------------------- Finance ----------------------------------- */

export type TxKind = 'expense' | 'income'

export interface TxCategory {
  id: string
  name: string
  icon: string
  kind: TxKind
  color: string
  sort: number
  isBuiltIn?: boolean
}

export interface Transaction {
  id: string
  kind: TxKind
  /** Amount in the user's currency, always positive */
  amount: number
  categoryId: string
  date: ISODate
  note?: string
  /** Set when generated from a recurring item */
  recurringId?: string
  createdAt: ISODateTime
}

export interface Budget {
  id: string
  categoryId: string
  /** Monthly limit */
  monthlyLimit: number
}

export interface RecurringPayment {
  id: string
  name: string
  amount: number
  categoryId: string
  /** Day of month 1–28 */
  dayOfMonth: number
  active: boolean
  note?: string
}

export interface SavingsGoal {
  id: string
  name: string
  icon: string
  targetAmount: number
  savedAmount: number
  deadline?: ISODate
  createdAt: ISODateTime
}

/* -------------------------------- Mind & spirit -------------------------------- */

export interface MoodEntry {
  id: string
  date: ISODate
  /** 'morning' | 'evening' check-in */
  slot: 'morning' | 'evening'
  /** 1 (very bad) … 5 (great) */
  mood: 1 | 2 | 3 | 4 | 5
  energy?: 1 | 2 | 3 | 4 | 5
  stress?: 1 | 2 | 3 | 4 | 5
  /** Free tags like 'работа', 'семья', 'зал' */
  tags?: string[]
  note?: string
  createdAt: ISODateTime
}

export interface JournalEntry {
  id: string
  date: ISODate
  kind: 'gratitude' | 'reflection' | 'evening_review' | 'free'
  /** For gratitude: 3 lines; for evening review: wins / improve / tomorrow */
  items?: string[]
  text?: string
  tags?: string[]
  createdAt: ISODateTime
}

export interface MindSession {
  id: string
  date: ISODate
  kind: 'meditation' | 'breathing' | 'prayer' | 'reading_spiritual'
  /** Preset name, e.g. 'box-4-4-4-4', 'calm-10' */
  preset?: string
  durationMin: number
  note?: string
  createdAt: ISODateTime
}

/* ------------------------------ Goals & weekly review ------------------------------ */

export type LifeArea =
  | 'body'
  | 'mind'
  | 'finance'
  | 'career'
  | 'relationships'
  | 'spirit'
  | 'learning'

export interface KeyResult {
  id: string
  title: string
  /** Starting value, needed to measure progress towards a decreasing target (e.g. weight 88 → 82) */
  start?: number
  /** Numeric progress: current / target (unit free text) */
  current: number
  target: number
  unit?: string
}

export interface LifeGoal {
  id: string
  area: LifeArea
  title: string
  why?: string
  deadline?: ISODate
  status: 'active' | 'done' | 'paused' | 'dropped'
  keyResults: KeyResult[]
  /** Habit ids that support this goal */
  habitIds?: string[]
  sort: number
  createdAt: ISODateTime
  completedAt?: ISODate
}

export interface WeeklyReview {
  id: string
  /** Monday of the reviewed week */
  weekStart: ISODate
  /** Auto-collected snapshot at the time of the review */
  stats: Record<string, number>
  wins: string[]
  improve: string[]
  /** Up to 3 priorities for next week */
  nextFocus: string[]
  /** Overall week rating 1–5 */
  rating?: 1 | 2 | 3 | 4 | 5
  createdAt: ISODateTime
}

export interface Setting {
  key: string
  value: unknown
}
