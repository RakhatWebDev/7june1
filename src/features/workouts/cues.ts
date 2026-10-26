import { plural } from '../../lib/format'
import { parseReps } from './autoreg'

/* ------------------------------------------------------------------ */
/* Spoken Russian phrases of the hands-free («скамья») mode.           */
/* The phrase is spoken inside the completion tap: iOS only allows     */
/* speech from a user gesture, timers get tones instead.               */
/* ------------------------------------------------------------------ */

type Gender = 'm' | 'f'

const UNITS_M = [
  'ноль',
  'один',
  'два',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
]
const TEENS = [
  'десять',
  'одиннадцать',
  'двенадцать',
  'тринадцать',
  'четырнадцать',
  'пятнадцать',
  'шестнадцать',
  'семнадцать',
  'восемнадцать',
  'девятнадцать',
]
const TENS = [
  '',
  '',
  'двадцать',
  'тридцать',
  'сорок',
  'пятьдесят',
  'шестьдесят',
  'семьдесят',
  'восемьдесят',
  'девяносто',
]
const HUNDREDS = [
  '',
  'сто',
  'двести',
  'триста',
  'четыреста',
  'пятьсот',
  'шестьсот',
  'семьсот',
  'восемьсот',
  'девятьсот',
]

const MINUTES: [string, string, string] = ['минута', 'минуты', 'минут']
const SECONDS: [string, string, string] = ['секунда', 'секунды', 'секунд']
const REPS: [string, string, string] = ['повтор', 'повтора', 'повторов']

/** 0–999 in words; feminine «одна/две» for минута, секунда. */
function words(n: number, gender: Gender = 'm'): string {
  const v = Math.max(0, Math.min(999, Math.round(n)))
  if (v === 0) return UNITS_M[0]
  const parts: string[] = []
  const h = Math.floor(v / 100)
  const rest = v % 100
  if (h) parts.push(HUNDREDS[h])
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10])
  else {
    const t = Math.floor(rest / 10)
    const u = rest % 10
    if (t) parts.push(TENS[t])
    if (u)
      parts.push(
        gender === 'f' && u === 1 ? 'одна' : gender === 'f' && u === 2 ? 'две' : UNITS_M[u],
      )
  }
  return parts.join(' ')
}

/** 82.5 → «восемьдесят два с половиной»; rounded to the nearest quarter. */
export function sayKg(kg: number): string {
  const q = Math.round(kg * 4) / 4
  const whole = Math.floor(q)
  const frac = q - whole
  if (frac === 0) return words(whole)
  if (whole === 0) return frac === 0.5 ? 'половина' : frac === 0.25 ? 'четверть' : 'три четверти'
  if (frac === 0.5) return `${words(whole)} с половиной`
  if (frac === 0.25) return `${words(whole)} с четвертью`
  return `${words(whole)} и три четверти`
}

/** 90 → «полторы минуты», 135 → «две минуты пятнадцать секунд». */
export function sayRest(sec: number): string {
  const total = Math.max(0, Math.round(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  const secPart = `${words(s, 'f')} ${plural(s, SECONDS)}`
  if (m === 0) return secPart
  if (s === 30) return m === 1 ? 'полторы минуты' : `${words(m, 'f')} с половиной минуты`
  const minPart = `${words(m, 'f')} ${plural(m, MINUTES)}`
  return s === 0 ? minPart : `${minPart} ${secPart}`
}

/** «6» → «шесть», «8-12» → «восемь – двенадцать»; AMRAP and free text → null. */
function sayReps(reps: string | null): { text: string; count: number } | null {
  if (!reps) return null
  const r = parseReps(reps)
  if (!r) return null
  return {
    text: r.min === r.max ? words(r.min) : `${words(r.min)} – ${words(r.max)}`,
    count: r.max,
  }
}

const isAmrap = (reps: string | null) => !!reps && reps.trim().toUpperCase() === 'AMRAP'

export interface NextSetCue {
  /** Set only when the next set starts another exercise */
  exerciseName?: string
  /** A warm-up set: said as «разминка» without a set number */
  warmup?: boolean
  /** 1-based */
  setNo: number
  weightKg: number | null
  /** Plan prescription: "6", "8-12", "AMRAP", free text */
  reps: string | null
  /** Same set last time, if any */
  last: { weightKg: number | null; reps: number | null } | null
}

function loadPart(weightKg: number | null, reps: string | null): string | null {
  const spoken = sayReps(reps)
  if (weightKg != null) {
    if (spoken) return `${sayKg(weightKg)} на ${spoken.text}`
    return isAmrap(reps) ? `${sayKg(weightKg)} до отказа` : sayKg(weightKg)
  }
  if (spoken) return `${spoken.text} ${plural(spoken.count, REPS)}`
  return isAmrap(reps) ? 'до отказа' : null
}

function lastPart(last: NextSetCue['last']): string | null {
  if (!last || last.reps == null) return null
  if (last.weightKg != null) return `${sayKg(last.weightKg)} на ${words(last.reps)}`
  return `${words(last.reps)} ${plural(last.reps, REPS)}`
}

/**
 * The phrase spoken at the completion tap: the rest and the next set.
 * «Отдых две минуты. Дальше: подход три, восемьдесят два с половиной на шесть. В прошлый раз …»
 */
/** «Тяга, подход один, пятьдесят пять на десять» / «разминка, сорок на восемь» */
function setHead(next: NextSetCue): string {
  return [
    next.exerciseName,
    next.warmup ? 'разминка' : `подход ${words(next.setNo)}`,
    loadPart(next.weightKg, next.reps),
  ]
    .filter(Boolean)
    .join(', ')
}

export function tapPhrase({ restSec, next }: { restSec: number; next: NextSetCue | null }): string {
  if (!next) return 'Все упражнения выполнены.'
  const sentences = [`Отдых ${sayRest(restSec)}.`, `Дальше: ${setHead(next)}.`]
  const last = lastPart(next.last)
  if (last) sentences.push(`В прошлый раз ${last}.`)
  return sentences.join(' ')
}

/**
 * Said when a rest runs out (voice mode). It fires from a timer, which iOS may refuse to speak —
 * then only the tones are heard. «Отдых окончен. Подход два, восемьдесят пять на пять.»
 */
export function restOverPhrase(next: NextSetCue | null): string {
  if (!next) return 'Отдых окончен.'
  const head = setHead(next)
  return `Отдых окончен. ${head.charAt(0).toUpperCase()}${head.slice(1)}.`
}
