import { addDays, format } from 'date-fns'
import type { ISODate, SetLog, WorkoutSession } from '../../db/types'
import { fromISODate, toISODate } from '../../lib/dates'

/* Small pure helpers shared by the coach tools, rules and UI. */

export const round = (n: number, digits = 0): number => {
  const k = 10 ** digits
  return Math.round(Number((n * k).toPrecision(12))) / k
}

export const sum = (xs: number[]): number => xs.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0)

export const avg = (xs: number[]): number | null => (xs.length ? sum(xs) / xs.length : null)

/** ISO date shifted by `n` days (negative = past). */
export function shiftDate(date: ISODate, n: number): ISODate {
  return toISODate(addDays(fromISODate(date), n))
}

/** First day of a window of `days` days that ends on (and includes) `end`. */
export function windowStart(end: ISODate, days: number): ISODate {
  return shiftDate(end, -(Math.max(1, days) - 1))
}

/** Local calendar day of an ISO timestamp (date-only strings are taken as-is). */
export function localDay(ts: string | undefined): ISODate {
  if (!ts) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : toISODate(d)
}

/** "HH:mm" in local time, or '' for an invalid timestamp. */
export function localTime(ts: string | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : format(d, 'HH:mm')
}

/** Whole days between two ISO dates (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000)
}

/** Clamp a numeric tool argument, falling back to `def`. */
export function intArg(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function strArg(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function numArg(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) ? n : undefined
}

export const isISODate = (s: unknown): s is ISODate => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/* ------------------------------ workouts ------------------------------ */

export const isWorkingSet = (s: SetLog): boolean => s.done && !s.warmup

export interface WorkSet {
  weightKg: number
  reps: number
  rpe?: number
}

export function workSets(sets: SetLog[]): WorkSet[] {
  return sets
    .filter((s) => isWorkingSet(s) && s.reps != null && s.reps > 0)
    .map((s) => ({ weightKg: s.weightKg ?? 0, reps: s.reps ?? 0, ...(s.rpe != null ? { rpe: s.rpe } : {}) }))
}

export const setsVolume = (sets: WorkSet[]): number => sum(sets.map((s) => s.weightKg * s.reps))

export function sessionVolumeKg(s: Pick<WorkoutSession, 'exercises'>): number {
  return round(sum(s.exercises.map((e) => setsVolume(workSets(e.sets)))))
}

/** Epley estimated 1RM. */
export function e1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30)
}

/** Best set by estimated 1RM, ties broken by weight. */
export function bestSet(sets: WorkSet[]): WorkSet | null {
  let best: WorkSet | null = null
  for (const s of sets) {
    if (!best || e1rm(s.weightKg, s.reps) > e1rm(best.weightKg, best.reps) + 1e-9) best = s
  }
  return best
}

/** "80x5, 80x5, 82.5x3" — compact set notation for AI tools. */
export function compactSets(sets: WorkSet[]): string {
  return sets.map((s) => `${s.weightKg}x${s.reps}${s.rpe != null ? `@${s.rpe}` : ''}`).join(', ')
}

/** Russian kilograms with a decimal comma: 82.5 → "82,5". */
export function fmtKg(n: number): string {
  return String(round(n, 2)).replace('.', ',')
}

/** Finished sessions sorted newest first. */
export function finishedNewestFirst(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.filter((s) => s.finishedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

/** Parse a rep prescription ("5", "3-5", "8–12", "AMRAP") into a range. */
export function parseRepRange(reps: string | undefined): { min: number; max: number } | null {
  if (!reps) return null
  const m = reps.match(/(\d+)\s*[-–—]\s*(\d+)/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    return { min: Math.min(a, b), max: Math.max(a, b) }
  }
  const single = reps.match(/(\d+)/)
  if (single) {
    const n = Number(single[1])
    return { min: n, max: n }
  }
  return null
}
