import { addDays } from 'date-fns'
import type { ISODate, KeyResult, LifeArea, LifeGoal } from '../../db/types'
import { fromISODate, toISODate, weekDates, weekdayIndex } from '../../lib/dates'
import { LIFE_AREAS } from './areas'
import { METRICS, type Better } from './metrics'

/* ------------------------------ key results ------------------------------ */

/**
 * Key result with an optional starting value. `start` is stored alongside the
 * shared `KeyResult` fields so decreasing targets (weight 88 → 82) can be measured.
 */
export interface GoalKeyResult extends KeyResult {
  start?: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Starting value of a key result (0 when it was never recorded). */
export function krStart(kr: GoalKeyResult): number {
  return Number.isFinite(kr.start) ? (kr.start as number) : 0
}

/**
 * Progress of a key result, 0–100. Works for both increasing (0 → 5) and
 * decreasing (88 → 82) targets: progress = (current − start) / (target − start).
 */
export function krProgress(kr: GoalKeyResult): number {
  const start = krStart(kr)
  const { current, target } = kr
  if (!Number.isFinite(current) || !Number.isFinite(target)) return 0
  if (target === start) return current === target ? 100 : 0
  return clamp01((current - start) / (target - start)) * 100
}

/** Average progress of a goal's key results, 0–100. A goal without KRs is 100 when done, else 0. */
export function goalProgress(goal: Pick<LifeGoal, 'keyResults' | 'status'>): number {
  const krs = goal.keyResults ?? []
  if (krs.length === 0) return goal.status === 'done' ? 100 : 0
  return krs.reduce((s, kr) => s + krProgress(kr), 0) / krs.length
}

/** Whether a key result runs downwards (e.g. bodyweight). */
export function isDecreasing(kr: GoalKeyResult): boolean {
  return kr.target < krStart(kr)
}

/** Stepper step for a key result: half-units for kg/km/hours or fractional values, else 1. */
export function krStep(kr: GoalKeyResult): number {
  const unit = (kr.unit ?? '').toLowerCase()
  const fractional = [kr.current, kr.target, krStart(kr)].some((v) => Number.isFinite(v) && !Number.isInteger(v))
  if (fractional || /кг|км|^ч|час|kg|km/.test(unit)) return 0.5
  return 1
}

/* ----------------------------- balance wheel ----------------------------- */

export interface WheelPoint {
  area: LifeArea
  name: string
  short: string
  icon: string
  /** 0–100, rounded */
  value: number
  /** Number of active goals in the area */
  goals: number
}

/**
 * Balance wheel: for each life area, the average progress of all key results of
 * its active goals (0–100). Areas without active goals (or KRs) are 0.
 */
export function wheelValues(goals: Pick<LifeGoal, 'area' | 'status' | 'keyResults'>[]): WheelPoint[] {
  return LIFE_AREAS.map((a) => {
    const active = goals.filter((g) => g.area === a.id && g.status === 'active')
    const krs = active.flatMap((g) => g.keyResults ?? [])
    const value = krs.length === 0 ? 0 : krs.reduce((s, kr) => s + krProgress(kr), 0) / krs.length
    return { area: a.id, name: a.name, short: a.short, icon: a.icon, value: Math.round(value), goals: active.length }
  })
}

/* --------------------------------- weeks --------------------------------- */

/** Monday of the week containing `date`. */
export function weekStartOf(date: ISODate | Date): ISODate {
  return weekDates(typeof date === 'string' ? fromISODate(date) : date)[0]
}

/** Shift a week start by `n` weeks. */
export function shiftWeek(weekStart: ISODate, n: number): ISODate {
  return toISODate(addDays(fromISODate(weekStart), n * 7))
}

/** Sunday of the week starting on `weekStart`. */
export function weekEndOf(weekStart: ISODate): ISODate {
  return toISODate(addDays(fromISODate(weekStart), 6))
}

/** Sunday and Monday are review days: time to wrap up the (just) finished week. */
export function isReviewDay(now: Date = new Date()): boolean {
  const wd = weekdayIndex(now)
  return wd === 6 || wd === 0
}

/**
 * The week a review started `now` should cover: on Sunday the current week
 * (it is ending), on any other day the previous one.
 */
export function reviewTargetWeek(now: Date = new Date()): ISODate {
  const ws = weekStartOf(now)
  return weekdayIndex(now) === 6 ? ws : shiftWeek(ws, -1)
}

/** "05.10 – 11.10" */
export function weekLabel(weekStart: ISODate): string {
  const end = weekEndOf(weekStart)
  const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`
  return `${dm(weekStart)} – ${dm(end)}`
}

/* ------------------------------ week deltas ------------------------------ */

export type Tone = 'good' | 'bad' | 'neutral'

export interface MetricDelta {
  key: string
  current: number
  previous: number
  diff: number
  direction: 'up' | 'down' | 'flat'
  tone: Tone
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function deltaTone(diff: number, better: Better): Tone {
  if (diff === 0 || better === 'neutral') return 'neutral'
  return (diff > 0) === (better === 'up') ? 'good' : 'bad'
}

/** Change of every known weekly metric against the previous week (missing values count as 0). */
export function weekDeltas(current: Record<string, number>, previous: Record<string, number> | undefined): MetricDelta[] {
  return METRICS.map((m) => {
    const cur = current[m.key] ?? 0
    const prev = previous?.[m.key] ?? 0
    const diff = round2(cur - prev)
    return {
      key: m.key,
      current: cur,
      previous: prev,
      diff,
      direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
      tone: deltaTone(diff, m.better),
    }
  })
}

/** Trimmed, non-empty lines (wins / improve / focus). */
export function cleanLines(lines: string[], max = 3): string[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, max)
}

/** Pad a list to exactly `n` editable slots. */
export function padLines(lines: string[] | undefined, n = 3): string[] {
  const out = [...(lines ?? [])].slice(0, n)
  while (out.length < n) out.push('')
  return out
}
