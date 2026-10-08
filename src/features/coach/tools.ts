import type { FormaDB } from '../../db'
import type {
  Activity,
  ActivityType,
  DayType,
  FoodEntry,
  ISODate,
  MealType,
  Program,
  ProgramDay,
  ProgramExercise,
  WeightEntry,
  WorkoutSession,
} from '../../db/types'
import { fromISODate, toISODate, weekDates, weekdayIndex } from '../../lib/dates'
import { newId } from '../../lib/id'
import { collectWeekStats } from '../goals/stats'
import {
  DEFAULT_SLEEP_TARGET_MIN,
  DEFAULT_WATER_TARGET_ML,
  dailyStreak,
  getActiveProgram,
  habitDoneIndex,
  summarizeProfile,
} from './summary'
import {
  avg,
  bestSet,
  compactSets,
  e1rm,
  finishedNewestFirst,
  intArg,
  isISODate,
  localDay,
  localTime,
  numArg,
  round,
  sessionVolumeKg,
  setsVolume,
  shiftDate,
  strArg,
  sum,
  windowStart,
  workSets,
} from './util'

/**
 * Tool registry shared by the rule-based coach and the AI assistant.
 * Every tool runs IN THE BROWSER against IndexedDB; only its JSON output
 * is ever sent to an AI provider. Agent K implements the tools, Agent L
 * converts `CoachTool[]` into provider-specific function declarations.
 */
export interface CoachTool {
  name: string
  /** One-paragraph description for the model (English) */
  description: string
  /** JSON Schema (draft-07 subset: object with properties/required) */
  inputSchema: Record<string, unknown>
  /** True when the tool writes to the database; the UI asks the user to confirm first */
  mutates?: boolean
  run: (input: Record<string, unknown>, db: FormaDB) => Promise<unknown>
}

/** Settings key holding notes for the next session: Record<exerciseId, NextSessionNote>. */
export const NEXT_NOTES_KEY = 'coach.nextNotes'

export interface NextSessionNote {
  note: string
  createdAt: string
}

/* ------------------------------ schema helpers ------------------------------ */

const obj = (properties: Record<string, unknown> = {}, required: string[] = []): Record<string, unknown> => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
})
const daysProp = (def: number, max: number) => ({
  days: { type: 'integer', minimum: 1, maximum: max, description: `Window length in days ending today (default ${def}).` },
})

const ACTIVITY_TYPES: ActivityType[] = ['run', 'bike', 'swim', 'rope', 'walk', 'stretch', 'hiit', 'other']
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const DAY_TYPES: DayType[] = ['push', 'pull', 'legs', 'upper', 'lower', 'full', 'arms', 'rest']

const compactDay = (d: ProgramDay) => ({
  id: d.id,
  name: d.name,
  type: d.type,
  ...(d.weekday != null ? { weekday: d.weekday } : {}),
  exercises: d.exercises.map((e) => ({
    exerciseId: e.exerciseId,
    name: e.name,
    sets: e.sets,
    reps: e.reps,
    ...(e.intensity ? { intensity: e.intensity } : {}),
  })),
})

const strip = <T extends Record<string, unknown>>(o: T): T => {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null) delete o[k]
  return o
}

/* ------------------------------- read tools ------------------------------- */

export async function getProfileAndTargets(db: FormaDB, now: Date = new Date()) {
  const s = await summarizeProfile(db, now)
  const p = s.profile
  return {
    date: toISODate(now),
    weekday: weekdayIndex(now),
    profile: p
      ? strip({
          name: p.name,
          sex: p.sex,
          age: now.getFullYear() - p.birthYear,
          heightCm: p.heightCm,
          goal: p.goal,
          activityLevel: p.activityLevel,
          targetWeightKg: p.targetWeightKg,
          waterTargetMl: p.waterTargetMl || DEFAULT_WATER_TARGET_ML,
          sleepTargetMin: p.sleepTargetMin || DEFAULT_SLEEP_TARGET_MIN,
        })
      : null,
    currentWeightKg: s.currentWeightKg,
    targets: s.targets,
    activeProgram: s.activeProgram
      ? {
          id: s.activeProgram.id,
          name: s.activeProgram.name,
          daysPerWeek: s.activeProgram.daysPerWeek,
          schedule: s.sequential ? 'sequential' : 'weekday',
          ...(s.scheduleLabel ? { progress: s.scheduleLabel } : {}),
          days: s.activeProgram.days.map((d) => strip({ id: d.id, name: d.name, type: d.type, weekday: d.weekday })),
        }
      : null,
    todayDay: s.todayDay ? compactDay(s.todayDay) : null,
  }
}

export async function getTodaysPlan(db: FormaDB, now: Date = new Date()) {
  const date = toISODate(now)
  const s = await summarizeProfile(db, now)
  const [sessions, activities, foods, water, events, notesSetting] = await Promise.all([
    db.sessions.toArray(),
    db.activities.where('date').equals(date).toArray(),
    db.foodEntries.where('date').equals(date).toArray(),
    db.water.where('date').equals(date).toArray(),
    db.calendarEvents.toArray(),
    db.settings.get(NEXT_NOTES_KEY),
  ])
  const notes = (notesSetting?.value ?? {}) as Record<string, NextSessionNote>
  const finished = finishedNewestFirst(sessions)
  const day = s.todayDay
  return {
    date,
    weekday: weekdayIndex(now),
    /** «Неделя 3 из 12 · тренировка 2 из 3» for cyclic programs */
    programLabel: s.scheduleLabel ?? null,
    programDay: day
      ? {
          programId: s.activeProgram?.id,
          /** rotation: next day of a sequential program (any weekday); weekday: the day fixed to today */
          resolvedBy: s.sequential ? 'rotation' : 'weekday',
          id: day.id,
          name: day.name,
          type: day.type,
          exercises: day.exercises.map((e) => {
            const last = lastSetsFor(finished, e.exerciseId)
            return strip({
              exerciseId: e.exerciseId,
              name: e.name,
              sets: e.sets,
              reps: e.reps,
              intensity: e.intensity,
              lastTime: last ? `${last.date}: ${compactSets(last.sets)}` : undefined,
              coachNote: notes[e.exerciseId]?.note,
            })
          }),
        }
      : null,
    workoutsToday: sessions
      .filter((x) => localDay(x.startedAt) === date)
      .map((x) => ({ id: x.id, name: x.name, finished: !!x.finishedAt, volumeKg: sessionVolumeKg(x) })),
    activitiesToday: activities.map((a) => strip({ type: a.type, durationMin: a.durationMin, distanceKm: a.distanceKm })),
    eventsToday: events
      .filter((e) => localDay(e.startAt) === date)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .map((e) => strip({ title: e.title, time: e.allDay ? 'all-day' : localTime(e.startAt), kind: e.kind })),
    nutritionToday: {
      kcal: round(sum(foods.map((f) => f.kcal))),
      proteinG: round(sum(foods.map((f) => f.proteinG)), 1),
      kcalTarget: s.targets?.kcal ?? null,
      proteinTargetG: s.targets?.proteinG ?? null,
    },
    waterToday: { ml: sum(water.map((w) => w.ml)), targetMl: s.profile?.waterTargetMl || DEFAULT_WATER_TARGET_ML },
  }
}

function lastSetsFor(finishedNewest: WorkoutSession[], exerciseId: string) {
  for (const sess of finishedNewest) {
    const sets = sess.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => workSets(e.sets))
    if (sets.length) return { date: localDay(sess.startedAt), sets }
  }
  return null
}

export async function getRecentWorkouts(db: FormaDB, days = 14, now: Date = new Date()) {
  const from = windowStart(toISODate(now), days)
  const sessions = finishedNewestFirst(await db.sessions.where('startedAt').aboveOrEqual(from).toArray())
  return {
    from,
    to: toISODate(now),
    count: sessions.length,
    totalVolumeKg: round(sum(sessions.map(sessionVolumeKg))),
    workouts: sessions.map((s) =>
      strip({
        id: s.id,
        date: localDay(s.startedAt),
        name: s.name,
        durationMin:
          s.finishedAt ? Math.max(0, Math.round((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60000)) : undefined,
        volumeKg: sessionVolumeKg(s),
        feeling: s.feeling,
        exercises: s.exercises
          .map((e) => ({ exerciseId: e.exerciseId, name: e.name, target: `${e.targetSets}x${e.targetReps}`, sets: workSets(e.sets) }))
          .filter((e) => e.sets.length > 0)
          .map((e) => ({ exerciseId: e.exerciseId, name: e.name, target: e.target, sets: compactSets(e.sets) })),
      }),
    ),
  }
}

export async function getExerciseHistory(
  db: FormaDB,
  query: { exerciseId?: string; name?: string; limit?: number },
) {
  const limit = query.limit ?? 5
  const [sessionsRaw, programs] = await Promise.all([db.sessions.toArray(), db.programs.toArray()])
  const sessions = finishedNewestFirst(sessionsRaw)
  let exerciseId = query.exerciseId
  let name: string | undefined
  if (!exerciseId && query.name) {
    const q = query.name.toLowerCase()
    const candidates: { id: string; name: string }[] = [
      ...sessions.flatMap((s) => s.exercises.map((e) => ({ id: e.exerciseId, name: e.name }))),
      ...programs.flatMap((p) => p.days.flatMap((d) => d.exercises.map((e) => ({ id: e.exerciseId, name: e.name })))),
    ]
    const hit =
      candidates.find((c) => c.name.toLowerCase() === q || c.id.toLowerCase() === q) ??
      candidates.find((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().replace(/_/g, ' ').includes(q))
    exerciseId = hit?.id
    name = hit?.name
  }
  if (!exerciseId) return { error: 'exercise_not_found', query: query.name ?? null }
  const history: { date: string; sets: string; volumeKg: number; e1rmKg: number }[] = []
  let bestWeight = 0
  let best1rm = 0
  for (const s of sessions) {
    const entries = s.exercises.filter((e) => e.exerciseId === exerciseId)
    const sets = entries.flatMap((e) => workSets(e.sets))
    if (!sets.length) continue
    name ??= entries[0].name
    const b = bestSet(sets)
    const orm = b ? e1rm(b.weightKg, b.reps) : 0
    bestWeight = Math.max(bestWeight, ...sets.map((x) => x.weightKg))
    best1rm = Math.max(best1rm, orm)
    if (history.length < limit)
      history.push({ date: localDay(s.startedAt), sets: compactSets(sets), volumeKg: round(setsVolume(sets)), e1rmKg: round(orm, 1) })
  }
  return { exerciseId, name: name ?? exerciseId, sessionsFound: history.length, bestWeightKg: bestWeight, bestE1rmKg: round(best1rm, 1), history }
}

export async function getNutritionSummary(db: FormaDB, days = 7, now: Date = new Date()) {
  const to = toISODate(now)
  const from = windowStart(to, days)
  const [s, entries, water] = await Promise.all([
    summarizeProfile(db, now),
    db.foodEntries.where('date').between(from, to, true, true).toArray(),
    db.water.where('date').between(from, to, true, true).toArray(),
  ])
  const byDay = new Map<string, FoodEntry[]>()
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  const waterByDay = new Map<string, number>()
  for (const w of water) waterByDay.set(w.date, (waterByDay.get(w.date) ?? 0) + w.ml)
  const daysOut = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, es]) => ({
      date,
      kcal: round(sum(es.map((e) => e.kcal))),
      proteinG: round(sum(es.map((e) => e.proteinG)), 1),
      fatG: round(sum(es.map((e) => e.fatG)), 1),
      carbsG: round(sum(es.map((e) => e.carbsG)), 1),
      entries: es.length,
      waterMl: waterByDay.get(date) ?? 0,
    }))
  // Today is still in progress: averages use complete days when there are any.
  const complete = daysOut.filter((d) => d.date !== to)
  const base = complete.length ? complete : daysOut
  const mean = (k: 'kcal' | 'proteinG' | 'fatG' | 'carbsG') => {
    const a = avg(base.map((d) => d[k]))
    return a == null ? null : round(a, k === 'kcal' ? 0 : 1)
  }
  return {
    from,
    to,
    targets: s.targets,
    loggedDays: daysOut.length,
    average: { kcal: mean('kcal'), proteinG: mean('proteinG'), fatG: mean('fatG'), carbsG: mean('carbsG') },
    averageExcludesToday: complete.length > 0,
    waterAvgMl: waterByDay.size ? round(sum([...waterByDay.values()]) / waterByDay.size) : null,
    days: daysOut,
  }
}

export async function getSleepSummary(db: FormaDB, days = 7, now: Date = new Date()) {
  const to = toISODate(now)
  const from = windowStart(to, days)
  const [profile, nights] = await Promise.all([db.profile.get(1), db.sleep.where('date').between(from, to, true, true).sortBy('date')])
  const mins = nights.map((n) => n.durationMin).filter((m) => m > 0)
  return {
    from,
    to,
    targetMin: profile?.sleepTargetMin || DEFAULT_SLEEP_TARGET_MIN,
    nightsLogged: nights.length,
    avgMin: mins.length ? round(sum(mins) / mins.length) : null,
    avgQuality: nights.length ? round(sum(nights.map((n) => n.quality)) / nights.length, 1) : null,
    nights: nights.map((n) => ({
      date: n.date,
      durationMin: n.durationMin,
      quality: n.quality,
      bedtime: localTime(n.bedtime),
      wake: localTime(n.wakeTime),
    })),
  }
}

/** Mean weight of entries in [from, to]. */
const meanWeight = (ws: WeightEntry[], from: ISODate, to: ISODate) => {
  const a = avg(ws.filter((w) => w.date >= from && w.date <= to).map((w) => w.weightKg))
  return a == null ? null : round(a, 2)
}

export async function getWeightTrend(db: FormaDB, days = 30, now: Date = new Date()) {
  const to = toISODate(now)
  const from = windowStart(to, days)
  const [profile, entries] = await Promise.all([db.profile.get(1), db.weights.where('date').between(from, to, true, true).sortBy('date')])
  const first = entries[0]
  const last = entries.at(-1)
  const spanDays = first && last ? Math.max(1, (fromISODate(last.date).getTime() - fromISODate(first.date).getTime()) / 86_400_000) : 0
  return {
    from,
    to,
    goal: profile?.goal ?? null,
    targetWeightKg: profile?.targetWeightKg ?? null,
    count: entries.length,
    first: first ? { date: first.date, weightKg: first.weightKg } : null,
    last: last ? { date: last.date, weightKg: last.weightKg } : null,
    changeKg: first && last ? round(last.weightKg - first.weightKg, 2) : null,
    weeklyRateKg: first && last && spanDays >= 6 ? round(((last.weightKg - first.weightKg) / spanDays) * 7, 2) : null,
    avgLast7: meanWeight(entries, windowStart(to, 7), to),
    avgPrev7: meanWeight(entries, windowStart(shiftDate(to, -7), 7), shiftDate(to, -7)),
    entries: entries.map((e) => strip({ date: e.date, weightKg: e.weightKg, bodyFatPct: e.bodyFatPct })),
  }
}

export async function getActivities(db: FormaDB, days = 14, now: Date = new Date()) {
  const to = toISODate(now)
  const from = windowStart(to, days)
  const list = await db.activities.where('date').between(from, to, true, true).sortBy('date')
  const byType: Record<string, { count: number; minutes: number; km: number }> = {}
  for (const a of list) {
    const t = (byType[a.type] ??= { count: 0, minutes: 0, km: 0 })
    t.count++
    t.minutes += a.durationMin || 0
    t.km = round(t.km + (a.distanceKm ?? 0), 2)
  }
  return {
    from,
    to,
    count: list.length,
    totalMin: round(sum(list.map((a) => a.durationMin))),
    byType,
    activities: list
      .reverse()
      .map((a) => strip({ date: a.date, type: a.type, durationMin: a.durationMin, distanceKm: a.distanceKm, kcal: a.kcal, avgHr: a.avgHr })),
  }
}

export async function getHabitsStatus(db: FormaDB, now: Date = new Date()) {
  const date = toISODate(now)
  const from = shiftDate(date, -60)
  const { habits, done } = await habitDoneIndex(db, from, date)
  const last7 = Array.from({ length: 7 }, (_, i) => shiftDate(date, -i))
  const week = weekDates(now)
  return {
    date,
    total: habits.length,
    doneToday: habits.filter((h) => done.get(h.id)?.has(date)).length,
    weekStart: weekDates(now)[0],
    habits: habits.map((h) => {
      const set = done.get(h.id) ?? new Set<string>()
      return strip({
        id: h.id,
        name: h.name,
        frequency: h.frequency,
        targetPerWeek: h.frequency === 'weekly' ? (h.targetPerWeek ?? 3) : undefined,
        doneThisWeek: h.frequency === 'weekly' ? week.filter((d) => set.has(d)).length : undefined,
        weekProgress:
          h.frequency === 'weekly' ? `${week.filter((d) => set.has(d)).length}/${h.targetPerWeek ?? 3}` : undefined,
        autoRule: h.autoRule ?? undefined,
        doneToday: set.has(date),
        streakDays: h.frequency === 'daily' ? dailyStreak(set, date) : undefined,
        doneLast7: last7.filter((d) => set.has(d)).length,
      })
    }),
  }
}

export async function getMoodAndMind(db: FormaDB, days = 7, now: Date = new Date()) {
  const to = toISODate(now)
  const from = windowStart(to, days)
  const [moods, sessions, journal] = await Promise.all([
    db.moods.where('date').between(from, to, true, true).sortBy('date'),
    db.mindSessions.where('date').between(from, to, true, true).sortBy('date'),
    db.journal.where('date').between(from, to, true, true).toArray(),
  ])
  const mean = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === 'number')
    return v.length ? round(sum(v) / v.length, 1) : null
  }
  return {
    from,
    to,
    avgMood: mean(moods.map((m) => m.mood)),
    avgEnergy: mean(moods.map((m) => m.energy)),
    avgStress: mean(moods.map((m) => m.stress)),
    checkins: moods.map((m) =>
      strip({ date: m.date, slot: m.slot, mood: m.mood, energy: m.energy, stress: m.stress, tags: m.tags?.length ? m.tags : undefined }),
    ),
    mindMinutes: round(sum(sessions.map((s) => s.durationMin))),
    mindSessions: sessions.map((s) => ({ date: s.date, kind: s.kind, durationMin: s.durationMin })),
    journalDays: new Set(journal.map((j) => j.date)).size,
    gratitudeDays: new Set(journal.filter((j) => j.kind === 'gratitude').map((j) => j.date)).size,
  }
}

export async function getWeekStats(db: FormaDB, weekStart?: ISODate, now: Date = new Date()) {
  const start = weekDates(weekStart ? fromISODate(weekStart) : now)[0]
  const prevStart = shiftDate(start, -7)
  const [stats, previous] = await Promise.all([collectWeekStats(db, start), collectWeekStats(db, prevStart)])
  return { weekStart: start, stats, previousWeekStart: prevStart, previous }
}

export async function getUpcomingEvents(db: FormaDB, days = 7, now: Date = new Date()) {
  const nowIso = now.toISOString()
  const until = new Date(now.getTime() + days * 86_400_000).toISOString()
  const today = toISODate(now)
  const events = (await db.calendarEvents.toArray())
    .filter((e) => (e.allDay ? localDay(e.startAt) >= today : e.endAt >= nowIso) && e.startAt <= until)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 30)
  return {
    from: today,
    days,
    events: events.map((e) =>
      strip({
        title: e.title,
        date: localDay(e.startAt),
        start: e.allDay ? undefined : localTime(e.startAt),
        end: e.allDay ? undefined : localTime(e.endAt),
        allDay: e.allDay || undefined,
        kind: e.kind,
        location: e.location,
      }),
    ),
  }
}

/* ------------------------------ mutating tools ------------------------------ */

export class ToolInputError extends Error {}

export async function logFoodEntry(db: FormaDB, input: Record<string, unknown>, now: Date = new Date()) {
  const date = isISODate(input.date) ? input.date : toISODate(now)
  const meal: MealType = MEAL_TYPES.includes(input.meal as MealType) ? (input.meal as MealType) : guessMeal(now)
  const grams = numArg(input.grams)
  if (grams == null || grams <= 0) throw new ToolInputError('grams must be a positive number')
  const foodId = strArg(input.foodId)
  const food = foodId ? await db.foods.get(foodId) : undefined
  const per = (v: number | undefined, base: number | undefined) =>
    v != null ? v : base != null ? (base * grams) / 100 : undefined
  const kcal = per(numArg(input.kcal), food?.kcal)
  if (kcal == null || kcal < 0) throw new ToolInputError('kcal is required (or a valid foodId)')
  const name = strArg(input.name) ?? food?.name
  if (!name) throw new ToolInputError('name is required')
  const entry: FoodEntry = {
    id: newId(),
    date,
    meal,
    ...(food ? { foodId: food.id } : {}),
    name,
    grams: round(grams),
    kcal: round(kcal),
    proteinG: round(per(numArg(input.proteinG), food?.proteinG) ?? 0, 1),
    carbsG: round(per(numArg(input.carbsG), food?.carbsG) ?? 0, 1),
    fatG: round(per(numArg(input.fatG), food?.fatG) ?? 0, 1),
    createdAt: now.toISOString(),
  }
  await db.foodEntries.add(entry)
  const { id, createdAt, ...rest } = entry
  void createdAt
  return { ok: true, id, entry: rest }
}

function guessMeal(now: Date): MealType {
  const h = now.getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

export async function logWeight(db: FormaDB, input: Record<string, unknown>, now: Date = new Date()) {
  const weightKg = numArg(input.weightKg)
  if (weightKg == null || weightKg < 20 || weightKg > 400) throw new ToolInputError('weightKg must be between 20 and 400')
  const date = isISODate(input.date) ? input.date : toISODate(now)
  const existing = await db.weights.where('date').equals(date).first()
  const bodyFatPct = numArg(input.bodyFatPct)
  const entry: WeightEntry = {
    ...existing,
    id: existing?.id ?? newId(),
    date,
    weightKg: round(weightKg, 2),
    ...(bodyFatPct != null ? { bodyFatPct } : {}),
  }
  await db.weights.put(entry)
  return { ok: true, id: entry.id, date, weightKg: entry.weightKg, replaced: !!existing }
}

export async function logActivity(db: FormaDB, input: Record<string, unknown>, now: Date = new Date()) {
  const type = input.type as ActivityType
  if (!ACTIVITY_TYPES.includes(type)) throw new ToolInputError(`type must be one of ${ACTIVITY_TYPES.join(', ')}`)
  const durationMin = numArg(input.durationMin)
  if (durationMin == null || durationMin <= 0) throw new ToolInputError('durationMin must be positive')
  const activity: Activity = { id: newId(), type, date: isISODate(input.date) ? input.date : toISODate(now), durationMin: round(durationMin) }
  const km = numArg(input.distanceKm)
  if (km != null && km > 0) activity.distanceKm = round(km, 3)
  const kcal = numArg(input.kcal)
  if (kcal != null && kcal >= 0) activity.kcal = round(kcal)
  const hr = numArg(input.avgHr)
  if (hr != null && hr > 0) activity.avgHr = round(hr)
  const notes = strArg(input.notes)
  if (notes) activity.notes = notes
  await db.activities.add(activity)
  return { ok: true, id: activity.id, date: activity.date, type, durationMin: activity.durationMin }
}

/** All pending notes for the next session (exerciseId → note). */
export async function getNextSessionNotes(db: FormaDB): Promise<Record<string, NextSessionNote>> {
  const s = await db.settings.get(NEXT_NOTES_KEY)
  return s?.value && typeof s.value === 'object' ? { ...(s.value as Record<string, NextSessionNote>) } : {}
}

export async function addNoteToNextSession(db: FormaDB, exerciseId: string, note: string, now: Date = new Date()) {
  if (!exerciseId) throw new ToolInputError('exerciseId is required')
  const text = note.trim()
  if (!text) throw new ToolInputError('note is required')
  const notes = await getNextSessionNotes(db)
  notes[exerciseId] = { note: text.slice(0, 280), createdAt: now.toISOString() }
  await db.settings.put({ key: NEXT_NOTES_KEY, value: notes })
  return { ok: true, exerciseId, note: notes[exerciseId].note }
}

/** Removes a consumed note (call when the next session with that exercise starts). */
export async function clearNextSessionNote(db: FormaDB, exerciseId: string): Promise<void> {
  const notes = await getNextSessionNotes(db)
  if (!(exerciseId in notes)) return
  delete notes[exerciseId]
  await db.settings.put({ key: NEXT_NOTES_KEY, value: notes })
}

export async function saveProgram(db: FormaDB, input: Record<string, unknown>, now: Date = new Date()) {
  const raw = (input.program && typeof input.program === 'object' ? input.program : input) as Record<string, unknown>
  const name = strArg(raw.name)
  if (!name) throw new ToolInputError('program.name is required')
  if (!Array.isArray(raw.days) || raw.days.length === 0) throw new ToolInputError('program.days must be a non-empty array')
  const days: ProgramDay[] = raw.days.map((d: unknown, i: number) => {
    const day = (d ?? {}) as Record<string, unknown>
    const type = DAY_TYPES.includes(day.type as DayType) ? (day.type as DayType) : 'full'
    const weekday = numArg(day.weekday)
    const exercises: ProgramExercise[] = (Array.isArray(day.exercises) ? day.exercises : []).map((e: unknown) => {
      const ex = (e ?? {}) as Record<string, unknown>
      const exerciseId = strArg(ex.exerciseId)
      const exName = strArg(ex.name) ?? exerciseId
      if (!exerciseId || !exName) throw new ToolInputError(`day ${i + 1}: every exercise needs exerciseId and name`)
      return {
        exerciseId,
        name: exName,
        sets: intArg(ex.sets, 3, 1, 20),
        reps: strArg(ex.reps) ?? (typeof ex.reps === 'number' ? String(ex.reps) : '8-12'),
        ...(numArg(ex.restSec) != null ? { restSec: intArg(ex.restSec, 90, 0, 900) } : {}),
        ...(strArg(ex.intensity) ? { intensity: strArg(ex.intensity) } : {}),
        ...(strArg(ex.notes) ? { notes: strArg(ex.notes) } : {}),
      }
    })
    if (type !== 'rest' && exercises.length === 0) throw new ToolInputError(`day ${i + 1}: training day has no exercises`)
    return {
      id: strArg(day.id) ?? `d${i + 1}`,
      name: strArg(day.name) ?? `День ${i + 1}`,
      type,
      ...(weekday != null && weekday >= 0 && weekday <= 6 ? { weekday: Math.round(weekday) } : {}),
      exercises,
      ...(strArg(day.notes) ? { notes: strArg(day.notes) } : {}),
    }
  })
  const program: Program = {
    id: newId(),
    name,
    description: strArg(raw.description) ?? '',
    ...(strArg(raw.source) ? { source: strArg(raw.source) } : {}),
    daysPerWeek: intArg(raw.daysPerWeek, days.filter((d) => d.type !== 'rest').length, 1, 7),
    days,
    isBuiltIn: false,
    createdAt: now.toISOString(),
  }
  await db.programs.add(program)
  if (input.makeActive === true) await db.settings.put({ key: 'activeProgramId', value: program.id })
  return { ok: true, id: program.id, name, days: days.length, active: input.makeActive === true }
}

/* --------------------------------- registry --------------------------------- */

export const COACH_TOOLS: CoachTool[] = [
  {
    name: 'get_profile_and_targets',
    description:
      'User profile (sex, age, height, goal cut/maintain/lean_bulk, activity level, target weight), current bodyweight (latest weigh-in), daily nutrition targets (kcal, protein, fat, carbs, BMR, TDEE), the active training program outline and the program day scheduled for today. Call this first to personalise any advice.',
    inputSchema: obj(),
    run: (_i, db) => getProfileAndTargets(db),
  },
  {
    name: 'get_todays_plan',
    description:
      "Today's plan: programLabel (cyclic programs: program week and session number, e.g. «Неделя 3 из 12 · тренировка 2 из 3»), the program day to do (next day of the rotation for sequential programs, or the day fixed to today's weekday) with exercises, prescribed sets/reps, what the user lifted last time and any coach note; workouts and activities already logged today; calendar events today; calories/protein eaten so far vs target; water so far vs target.",
    inputSchema: obj(),
    run: (_i, db) => getTodaysPlan(db),
  },
  {
    name: 'get_recent_workouts',
    description:
      'Finished gym sessions in the last N days (newest first) with duration, total volume (kg) and per-exercise working sets in compact "weight x reps[@rpe]" notation. Warm-up sets are excluded.',
    inputSchema: obj(daysProp(14, 90)),
    run: (i, db) => getRecentWorkouts(db, intArg(i.days, 14, 1, 90)),
  },
  {
    name: 'get_exercise_history',
    description:
      'History of one exercise across finished sessions: best weight, best estimated 1RM (Epley) and the last `limit` sessions with sets, volume and e1RM. Identify the exercise by library `exerciseId` (e.g. "Barbell_Squat") or by a (partial, Russian or English) `name`.',
    inputSchema: obj({
      exerciseId: { type: 'string', description: 'Library exercise id' },
      name: { type: 'string', description: 'Exercise name or part of it, used when exerciseId is unknown' },
      limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Sessions to return (default 5)' },
    }),
    run: (i, db) =>
      getExerciseHistory(db, { exerciseId: strArg(i.exerciseId), name: strArg(i.name), limit: intArg(i.limit, 5, 1, 30) }),
  },
  {
    name: 'get_nutrition_summary',
    description:
      'Food diary for the last N days: per-day kcal/protein/fat/carbs and water, averages (excluding the unfinished current day when possible) and the daily targets to compare against.',
    inputSchema: obj(daysProp(7, 60)),
    run: (i, db) => getNutritionSummary(db, intArg(i.days, 7, 1, 60)),
  },
  {
    name: 'get_sleep_summary',
    description: 'Sleep for the last N nights: duration (minutes), quality 1-5, bedtime and wake time, averages and the target.',
    inputSchema: obj(daysProp(7, 60)),
    run: (i, db) => getSleepSummary(db, intArg(i.days, 7, 1, 60)),
  },
  {
    name: 'get_weight_trend',
    description:
      'Bodyweight weigh-ins over the last N days with first/last, change, weekly rate, 7-day averages (this vs previous week), goal and target weight.',
    inputSchema: obj(daysProp(30, 365)),
    run: (i, db) => getWeightTrend(db, intArg(i.days, 30, 1, 365)),
  },
  {
    name: 'get_activities',
    description: 'Cardio and other activities (run, bike, swim, rope, walk, stretch, hiit) in the last N days with totals by type.',
    inputSchema: obj(daysProp(14, 90)),
    run: (i, db) => getActivities(db, intArg(i.days, 14, 1, 90)),
  },
  {
    name: 'get_habits_status',
    description:
      "Active habits with today's completion and completions in the last 7 days. Daily habits include the current streak in days; weekly habits (e.g. 'workout 3x per week') include doneThisWeek and weekProgress like \"1/3\" for the current Monday-based week.",
    inputSchema: obj(),
    run: (_i, db) => getHabitsStatus(db),
  },
  {
    name: 'get_mood_and_mind',
    description:
      'Mood check-ins (mood, energy, stress on 1-5 scales, tags) for the last N days with averages, plus meditation/breathing minutes and journaling days.',
    inputSchema: obj(daysProp(7, 60)),
    run: (i, db) => getMoodAndMind(db, intArg(i.days, 7, 1, 60)),
  },
  {
    name: 'get_week_stats',
    description:
      'Aggregated statistics of a Monday-based week (workouts, volume, cardio, sleep, kcal, water, habits %, reading, mood, finance, weight) together with the previous week for comparison. Defaults to the current week.',
    inputSchema: obj({ weekStart: { type: 'string', description: 'Any date of the week, YYYY-MM-DD (default: today)' } }),
    run: (i, db) => getWeekStats(db, isISODate(i.weekStart) ? i.weekStart : undefined),
  },
  {
    name: 'get_upcoming_events',
    description: 'Upcoming calendar events (imported gym/pool/class bookings) for the next N days.',
    inputSchema: obj({ days: { type: 'integer', minimum: 1, maximum: 30, description: 'Days ahead (default 7)' } }),
    run: (i, db) => getUpcomingEvents(db, intArg(i.days, 7, 1, 30)),
  },
  {
    name: 'log_food_entry',
    description:
      'Adds a food diary entry. Provide name, grams and the macros FOR THE WHOLE PORTION (kcal, proteinG, carbsG, fatG), or a `foodId` from the user food library to compute macros from per-100 g values. meal defaults by time of day, date defaults to today.',
    inputSchema: obj(
      {
        name: { type: 'string' },
        grams: { type: 'number', exclusiveMinimum: 0 },
        kcal: { type: 'number', minimum: 0 },
        proteinG: { type: 'number', minimum: 0 },
        carbsG: { type: 'number', minimum: 0 },
        fatG: { type: 'number', minimum: 0 },
        meal: { type: 'string', enum: MEAL_TYPES },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        foodId: { type: 'string' },
      },
      ['name', 'grams'],
    ),
    mutates: true,
    run: (i, db) => logFoodEntry(db, i),
  },
  {
    name: 'log_weight',
    description: 'Records a bodyweight weigh-in in kg (replaces an existing entry for the same date). date defaults to today.',
    inputSchema: obj(
      {
        weightKg: { type: 'number', minimum: 20, maximum: 400 },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        bodyFatPct: { type: 'number', minimum: 2, maximum: 70 },
      },
      ['weightKg'],
    ),
    mutates: true,
    run: (i, db) => logWeight(db, i),
  },
  {
    name: 'log_activity',
    description: 'Logs a cardio/other activity (run, bike, swim, rope, walk, stretch, hiit, other) with duration in minutes and optional distance km, kcal, average heart rate.',
    inputSchema: obj(
      {
        type: { type: 'string', enum: ACTIVITY_TYPES },
        durationMin: { type: 'number', exclusiveMinimum: 0 },
        distanceKm: { type: 'number', minimum: 0 },
        kcal: { type: 'number', minimum: 0 },
        avgHr: { type: 'number', minimum: 0 },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        notes: { type: 'string' },
      },
      ['type', 'durationMin'],
    ),
    mutates: true,
    run: (i, db) => logActivity(db, i),
  },
  {
    name: 'add_note_to_next_session',
    description:
      'Saves a short coaching note (e.g. "try 82.5 kg x 5") for an exercise; it is shown the next time the user trains that exercise. One note per exercise; a new note replaces the old one.',
    inputSchema: obj(
      { exerciseId: { type: 'string' }, note: { type: 'string', maxLength: 280 } },
      ['exerciseId', 'note'],
    ),
    mutates: true,
    run: (i, db) => addNoteToNextSession(db, strArg(i.exerciseId) ?? '', strArg(i.note) ?? ''),
  },
  {
    name: 'save_program',
    description:
      'Saves a new custom training program. `program` = { name, description, daysPerWeek, days: [{ name, type (push|pull|legs|upper|lower|full|arms|rest), weekday (0=Mon..6=Sun, optional), exercises: [{ exerciseId (library id like "Barbell_Bench_Press_-_Medium_Grip"), name (Russian display name), sets, reps ("5", "8-12"), restSec?, intensity? ("RPE 8"), notes? }] }] }. Set makeActive=true to make it the active program.',
    inputSchema: obj(
      {
        program: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            daysPerWeek: { type: 'integer', minimum: 1, maximum: 7 },
            days: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: DAY_TYPES },
                  weekday: { type: 'integer', minimum: 0, maximum: 6 },
                  exercises: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        exerciseId: { type: 'string' },
                        name: { type: 'string' },
                        sets: { type: 'integer', minimum: 1 },
                        reps: { type: 'string' },
                        restSec: { type: 'integer', minimum: 0 },
                        intensity: { type: 'string' },
                        notes: { type: 'string' },
                      },
                      required: ['exerciseId', 'name', 'sets', 'reps'],
                    },
                  },
                },
                required: ['name', 'type', 'exercises'],
              },
            },
          },
          required: ['name', 'days'],
        },
        makeActive: { type: 'boolean' },
      },
      ['program'],
    ),
    mutates: true,
    run: (i, db) => saveProgram(db, i),
  },
]

export function getCoachTool(name: string): CoachTool | undefined {
  return COACH_TOOLS.find((t) => t.name === name)
}

/** Re-exported for the AI assistant's system prompt context. */
export { getActiveProgram, summarizeProfile }
export type { ProfileSummary } from './summary'
