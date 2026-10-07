import Dexie, { type EntityTable } from 'dexie'
import type {
  Activity,
  Book,
  Habit,
  HabitLog,
  ReadingLog,
  CalendarEvent,
  CalendarFeed,
  Food,
  FoodEntry,
  Measurement,
  Profile,
  Program,
  Setting,
  SleepEntry,
  WaterEntry,
  WeightEntry,
  WorkoutSession,
} from './types'

export class FormaDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>
  programs!: EntityTable<Program, 'id'>
  sessions!: EntityTable<WorkoutSession, 'id'>
  activities!: EntityTable<Activity, 'id'>
  foods!: EntityTable<Food, 'id'>
  foodEntries!: EntityTable<FoodEntry, 'id'>
  water!: EntityTable<WaterEntry, 'id'>
  weights!: EntityTable<WeightEntry, 'id'>
  measurements!: EntityTable<Measurement, 'id'>
  sleep!: EntityTable<SleepEntry, 'id'>
  settings!: EntityTable<Setting, 'key'>
  calendarEvents!: EntityTable<CalendarEvent, 'id'>
  calendarFeeds!: EntityTable<CalendarFeed, 'id'>
  habits!: EntityTable<Habit, 'id'>
  habitLogs!: EntityTable<HabitLog, 'id'>
  books!: EntityTable<Book, 'id'>
  readingLogs!: EntityTable<ReadingLog, 'id'>

  constructor(name = 'forma') {
    super(name)
    // Bump the version and add an `upgrade()` when changing indexes.
    this.version(1).stores({
      profile: 'id',
      programs: 'id, name, isBuiltIn',
      sessions: 'id, startedAt, programId, programDayId',
      activities: 'id, date, type',
      foods: 'id, name',
      foodEntries: 'id, date, [date+meal]',
      water: 'id, date',
      weights: 'id, date',
      measurements: 'id, date',
      sleep: 'id, date',
      settings: 'key',
    })
    this.version(2).stores({
      calendarEvents: 'id, startAt, kind, source',
      calendarFeeds: 'id',
    })
    this.version(3).stores({
      habits: 'id, sort, archived',
      habitLogs: 'id, date, habitId, [habitId+date]',
      books: 'id, status, title',
      readingLogs: 'id, date, bookId',
    })
  }
}

export const db = new FormaDB()

export * from './types'
