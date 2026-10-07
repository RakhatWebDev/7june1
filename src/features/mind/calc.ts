import { addDays } from 'date-fns'
import type {
  Activity,
  FoodEntry,
  Habit,
  HabitLog,
  ISODate,
  JournalEntry,
  MindSession,
  MoodEntry,
  WaterEntry,
  WorkoutSession,
} from '../../db/types'
import { fromISODate, toISODate } from '../../lib/dates'

/* --------------------------------- Labels --------------------------------- */

export type Slot = MoodEntry['slot']
export type MoodValue = MoodEntry['mood']
export type JournalKind = JournalEntry['kind']
export type MindKind = MindSession['kind']

/** Index = mood − 1 */
export const MOOD_EMOJI = ['😞', '😕', '😐', '🙂', '😄'] as const
export const MOOD_LABEL = ['Плохо', 'Так себе', 'Нормально', 'Хорошо', 'Отлично'] as const
export const MOOD_VALUES: MoodValue[] = [1, 2, 3, 4, 5]

export const DEFAULT_TAGS = ['работа', 'зал', 'семья', 'друзья', 'учёба', 'деньги', 'здоровье', 'сон', 'погода']

export const SLOT_LABEL: Record<Slot, string> = { morning: 'Утро', evening: 'Вечер' }

export const JOURNAL_KIND_LABEL: Record<JournalKind, string> = {
  gratitude: 'Благодарность',
  reflection: 'Размышление',
  evening_review: 'Вечерний обзор',
  free: 'Свободная запись',
}

export const JOURNAL_KIND_ICON: Record<JournalKind, string> = {
  gratitude: '💛',
  reflection: '💭',
  evening_review: '🌙',
  free: '✍️',
}

export const REVIEW_PROMPTS = ['Что получилось', 'Что улучшить', 'Главное на завтра'] as const

export const MIND_KIND_LABEL: Record<MindKind, string> = {
  meditation: 'Медитация',
  breathing: 'Дыхание',
  prayer: 'Молитва',
  reading_spiritual: 'Духовное чтение',
}

export const MIND_KIND_ICON: Record<MindKind, string> = {
  meditation: '🧘',
  breathing: '🌬️',
  prayer: '🕯️',
  reading_spiritual: '📖',
}

export function isMindKind(v: unknown): v is MindKind {
  return v === 'meditation' || v === 'breathing' || v === 'prayer' || v === 'reading_spiritual'
}

export function isJournalKind(v: unknown): v is JournalKind {
  return v === 'gratitude' || v === 'reflection' || v === 'evening_review' || v === 'free'
}

export function isSlot(v: unknown): v is Slot {
  return v === 'morning' || v === 'evening'
}

/** Morning until 15:00 local time, evening afterwards. */
export function defaultSlot(d: Date = new Date()): Slot {
  return d.getHours() < 15 ? 'morning' : 'evening'
}

/** Deterministic id so there is at most one check-in per slot and day. */
export function moodEntryId(date: ISODate, slot: Slot): string {
  return `mood-${date}-${slot}`
}

/* --------------------------------- Helpers -------------------------------- */

export function shiftDate(date: ISODate, days: number): ISODate {
  return toISODate(addDays(fromISODate(date), days))
}

/** `n` consecutive dates ending with `ref`, oldest first. */
export function lastNDates(ref: ISODate, n: number): ISODate[] {
  return Array.from({ length: n }, (_, i) => shiftDate(ref, i - n + 1))
}

/** "2026-10-07" → "07.10" */
export function ddmm(date: ISODate): string {
  const [, m, d] = date.split('-')
  return `${d}.${m}`
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function average(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((s, n) => s + n, 0) / nums.length
}

/** Trimmed, lower-cased, single-spaced tag. */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Trim and drop empty lines. */
export function cleanItems(items: string[] | undefined): string[] {
  return (items ?? []).map((s) => s.trim()).filter(Boolean)
}

/** "работа, Зал ,, семья" → ['работа', 'зал', 'семья'] (unique) */
export function parseTags(input: string): string[] {
  return [...new Set(input.split(',').map(normalizeTag).filter(Boolean))]
}

/* ---------------------------------- Mood ---------------------------------- */

export interface MoodPoint {
  date: ISODate
  label: string
  mood: number | null
  energy: number | null
}

/** One point per day for the `days` days ending at `ref` (average of that day's check-ins). */
export function moodSeries(moods: MoodEntry[], ref: ISODate, days = 30): MoodPoint[] {
  const byDate = new Map<ISODate, MoodEntry[]>()
  for (const m of moods) {
    const list = byDate.get(m.date)
    if (list) list.push(m)
    else byDate.set(m.date, [m])
  }
  return lastNDates(ref, days).map((date) => {
    const list = byDate.get(date) ?? []
    const mood = average(list.map((m) => m.mood))
    const energy = average(list.flatMap((m) => (m.energy != null ? [m.energy] : [])))
    return {
      date,
      label: ddmm(date),
      mood: mood == null ? null : round1(mood),
      energy: energy == null ? null : round1(energy),
    }
  })
}

/** Average mood over the `days` days ending at `ref`, or null without data. */
export function averageMood(moods: MoodEntry[], ref: ISODate, days = 30): number | null {
  const from = shiftDate(ref, -(days - 1))
  const avg = average(moods.filter((m) => m.date >= from && m.date <= ref).map((m) => m.mood))
  return avg == null ? null : round1(avg)
}

export interface TagInsight {
  tag: string
  withAvg: number
  withoutAvg: number
  withCount: number
  withoutCount: number
  /** withAvg − withoutAvg (rounded to 0.1) */
  delta: number
}

/**
 * Mean mood of check-ins with vs. without each tag over the `days` days ending at `ref`.
 * A tag needs at least `minCount` tagged check-ins and one untagged one to be compared.
 * Sorted by the strength of the effect (|delta|), then by how often the tag occurs.
 */
export function tagInsights(moods: MoodEntry[], ref: ISODate, days = 30, minCount = 2): TagInsight[] {
  const from = shiftDate(ref, -(days - 1))
  const inRange = moods.filter((m) => m.date >= from && m.date <= ref)
  const tagged = inRange.map((m) => ({ mood: m.mood, tags: new Set((m.tags ?? []).map(normalizeTag).filter(Boolean)) }))
  const allTags = new Set(tagged.flatMap((m) => [...m.tags]))
  const out: TagInsight[] = []
  for (const tag of allTags) {
    const withTag = tagged.filter((m) => m.tags.has(tag)).map((m) => m.mood)
    const withoutTag = tagged.filter((m) => !m.tags.has(tag)).map((m) => m.mood)
    if (withTag.length < minCount || withoutTag.length === 0) continue
    const withAvg = average(withTag)!
    const withoutAvg = average(withoutTag)!
    out.push({
      tag,
      withAvg: round1(withAvg),
      withoutAvg: round1(withoutAvg),
      withCount: withTag.length,
      withoutCount: withoutTag.length,
      delta: round1(withAvg - withoutAvg),
    })
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.withCount - a.withCount || a.tag.localeCompare(b.tag))
}

/** Human sentence for an insight, e.g. «С тегом «зал» настроение в среднем 4.2, без — 3.4». */
export function insightText(i: TagInsight): string {
  return `С тегом «${i.tag}» настроение в среднем ${i.withAvg.toFixed(1)}, без — ${i.withoutAvg.toFixed(1)}`
}

/* ------------------------------- Gratitude -------------------------------- */

/** Days with at least one non-empty gratitude entry. */
export function gratitudeDays(journal: JournalEntry[]): Set<ISODate> {
  const days = new Set<ISODate>()
  for (const e of journal) {
    if (e.kind === 'gratitude' && (cleanItems(e.items).length > 0 || (e.text ?? '').trim() !== '')) days.add(e.date)
  }
  return days
}

/**
 * Consecutive days with gratitude ending at `ref`. A day without an entry yet does not
 * break the streak until it is over: if `ref` is empty, counting starts from the day before.
 */
export function gratitudeStreak(journal: JournalEntry[], ref: ISODate): number {
  const days = gratitudeDays(journal)
  let d = days.has(ref) ? ref : shiftDate(ref, -1)
  let n = 0
  while (days.has(d)) {
    n++
    d = shiftDate(d, -1)
  }
  return n
}

/* -------------------------------- Practice -------------------------------- */

/** Total practice minutes on dates within [from, to] (inclusive). */
export function practiceMinutes(sessions: MindSession[], from: ISODate, to: ISODate = from): number {
  return sessions.filter((s) => s.date >= from && s.date <= to).reduce((sum, s) => sum + s.durationMin, 0)
}

/* --------------------------------- Journal -------------------------------- */

export type JournalFilter = JournalKind | 'all'

/** Entries matching the kind filter and the text query (case-insensitive), newest first. */
export function searchJournal(entries: JournalEntry[], query: string, kind: JournalFilter = 'all'): JournalEntry[] {
  const q = query.trim().toLowerCase()
  return entries
    .filter((e) => kind === 'all' || e.kind === kind)
    .filter((e) => {
      if (!q) return true
      const hay = [e.text ?? '', ...(e.items ?? []), ...(e.tags ?? [])].join('\n').toLowerCase()
      return hay.includes(q)
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}

/** Short one-line preview of an entry for the feed. */
export function journalPreview(e: JournalEntry, max = 140): string {
  let s: string
  if (e.kind === 'evening_review') {
    s = (e.items ?? [])
      .map((v, i) => (v.trim() ? `${REVIEW_PROMPTS[i] ?? ''}: ${v.trim()}` : ''))
      .filter(Boolean)
      .join(' · ')
  } else {
    const items = cleanItems(e.items)
    s = items.length > 0 ? items.join(' · ') : (e.text ?? '').trim().replace(/\s+/g, ' ')
  }
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/* ------------------------------ Day summary ------------------------------- */

export interface DaySummaryInput {
  sessions: WorkoutSession[]
  activities: Activity[]
  foodEntries: FoodEntry[]
  water: WaterEntry[]
  habits: Habit[]
  habitLogs: HabitLog[]
}

export interface DaySummary {
  /** A gym session was started that local day */
  workout: boolean
  cardioMin: number
  kcal: number
  waterMl: number
  habitsDone: number
  habitsTotal: number
}

/** Local calendar day of an ISO timestamp. */
export function localDateOf(iso: string): ISODate {
  return toISODate(new Date(iso))
}

/** What the day looked like — shown next to the evening review. */
export function daySummary(input: DaySummaryInput, date: ISODate): DaySummary {
  const active = input.habits.filter((h) => !h.archived)
  const activeIds = new Set(active.map((h) => h.id))
  const doneIds = new Set(input.habitLogs.filter((l) => l.date === date && l.done && activeIds.has(l.habitId)).map((l) => l.habitId))
  return {
    workout: input.sessions.some((s) => localDateOf(s.startedAt) === date),
    cardioMin: input.activities.filter((a) => a.date === date).reduce((s, a) => s + a.durationMin, 0),
    kcal: Math.round(input.foodEntries.filter((f) => f.date === date).reduce((s, f) => s + f.kcal, 0)),
    waterMl: input.water.filter((w) => w.date === date).reduce((s, w) => s + w.ml, 0),
    habitsDone: doneIds.size,
    habitsTotal: active.length,
  }
}
