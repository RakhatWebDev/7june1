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

/** One prescribed set: reps text plus an optional % of the lift's 1RM (0..1.5). */
export interface SetTarget {
  /** "10", "AMRAP", "1 (heavy)", "45-60 с" */
  reps: string
  /** Fraction of the current max for the lift in `maxLiftId` / the exercise itself, e.g. 0.8 */
  pct?: number
  note?: string
}

/** Prescription for one week of a cycle. Index in `ProgramExercise.weekly` = week (0-based). */
export interface ProgramExerciseWeek {
  sets: number
  reps: string
  intensity?: string
  /** Explicit per-set targets (length === sets) — e.g. 10-8-6 at 60/70/80 % */
  scheme?: SetTarget[]
  notes?: string
}

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
  /** Explicit per-set targets for the base prescription (length === sets) */
  scheme?: SetTarget[]
  /** Week-by-week prescriptions for cyclic programs; overrides the base fields for that week */
  weekly?: ProgramExerciseWeek[]
  /** Exercise id whose max the % targets refer to (defaults to `exerciseId`), e.g. pause squat → squat */
  maxLiftId?: string
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
  /** Training days per calendar week (for rotating built-ins = `sessionsPerWeek`, the rotation length is `days.length`) */
  daysPerWeek: number
  days: ProgramDay[]
  isBuiltIn: boolean
  createdAt: ISODateTime
  /** 'weekday' — each day has a fixed weekday; 'sequential' — days rotate in order regardless of weekday */
  schedule?: 'weekday' | 'sequential'
  /** Total program length in weeks; every `ProgramExercise.weekly` has this length (indexed by program week) */
  weeks?: number
  /** Sessions that make one program week: week = floor(completed sessions in the cycle / sessionsPerWeek) */
  sessionsPerWeek?: number
  /** Structure version of a built-in program; seeding resets the cycle state when it changes */
  version?: number
  /** Labelled ranges of program weeks for the week selector (0-based, inclusive), e.g. «Блок 1 · 10-8-6», «Тест» */
  blocks?: { label: string; fromWeek: number; toWeek: number; test?: boolean }[]
  /** How to run the cycle (e.g. "run twice with a test week in between") */
  cycleNotes?: string
  /** Lifts whose 1RM the program's percentages are based on */
  maxLifts?: { exerciseId: string; label: string }[]
  /** Recommended %-of-max per rep count, e.g. { "10": 0.6, "8": 0.7 } */
  pctTable?: Record<string, number>
}

/** Where the user is in a cyclic program (settings key `program.cycle:<programId>`). */
export interface ProgramCycleState {
  startDate: ISODate
  /** Sessions of this program finished since the cycle start (the program week is derived from it) */
  completedSessions?: number
  /** Legacy 0-based week override, used only when `completedSessions` is absent */
  week?: number
  /** Index of the next day to do for `sequential` programs */
  nextDayIndex?: number
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
  /** Per-set targets resolved at session start (reps + suggested kg from % of max), length === targetSets */
  targets?: { reps: string; weightKg?: number; pct?: number }[]
  /** Hint text for this exercise, e.g. "+2.5 кг" from the coach or the program notes */
  hint?: string
}

export interface WorkoutSession {
  id: string
  programId?: string
  programDayId?: string
  /** 0-based program week the session was started in (cyclic programs) */
  programWeek?: number
  /** 0-based index of the session within the program cycle (completed sessions before it) */
  programSession?: number
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

/* ------------------------------------ Coach / AI ------------------------------------ */

export interface ChatMessage {
  id: string
  /** Conversation id; 'coach' for the main trainer chat */
  threadId: string
  role: 'user' | 'assistant' | 'tool'
  /** Plain text (markdown allowed) */
  text: string
  /** Provider that produced an assistant message */
  provider?: 'gemini' | 'claude' | 'rules'
  /** Tool calls made while producing this message, for transparency */
  toolCalls?: { name: string; input: unknown; output: unknown }[]
  createdAt: ISODateTime
}

export interface Setting {
  key: string
  value: unknown
}
