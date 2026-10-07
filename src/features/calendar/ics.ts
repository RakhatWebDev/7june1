import type { CalendarEvent } from '../../db/types'

/**
 * Minimal iCalendar (RFC 5545) reader for the calendar feature.
 *
 * Scope (deliberately small, no dependencies):
 *  - line unfolding (CRLF/LF followed by a space or tab), TEXT unescaping (\n \, \; \\)
 *  - VEVENT only; nested components (VALARM) and VTIMEZONE blocks are skipped
 *  - DTSTART/DTEND/RECURRENCE-ID/EXDATE in UTC (`…Z`), floating, `TZID=…` and `VALUE=DATE` forms
 *  - DURATION when DTEND is missing; STATUS:CANCELLED events are dropped
 *  - RRULE: only plain `FREQ=WEEKLY` (INTERVAL, BYDAY without ordinals, COUNT, UNTIL, WKST) is
 *    expanded, within a window of ±8 weeks around `now`. Any other rule keeps the first occurrence.
 *
 * Time zones: `TZID` values are resolved with `Intl.DateTimeFormat` when they are IANA names
 * (Google and Apple use IANA names, e.g. `Europe/Moscow`). Floating times and a TZID equal to the
 * browser zone are taken as local wall-clock time. Known limitation: non-IANA TZIDs (Outlook's
 * "W. Europe Standard Time", custom VTIMEZONE definitions) are NOT converted — they fall back to local
 * time, which is correct whenever the calendar and the browser share a zone (the common case).
 */

export type EventKind = CalendarEvent['kind']

export interface ParseOptions {
  /** Reference "now" for the recurrence window and `importedAt`. Defaults to the current time. */
  now?: Date
  /** How many weeks of weekly recurrences to expand after `now`. Default 8. */
  horizonWeeks?: number
  /** How many weeks of weekly recurrences to keep before `now`. Default 8. */
  lookbackWeeks?: number
}

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
/** Hard cap on weekly-expansion iterations (guards against runaway rules). */
const MAX_WEEKS = 5_000

/* ------------------------------------------------------------------ */
/* Lines and properties                                                */
/* ------------------------------------------------------------------ */

/** Joins folded lines: a line starting with a space or tab continues the previous one. */
export function unfoldLines(text: string): string[] {
  const raw = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else if (line.length > 0) {
      out.push(line)
    }
  }
  return out
}

export interface IcsProperty {
  name: string
  params: Record<string, string>
  value: string
}

/** Parses `NAME;PARAM=VALUE;PARAM="quoted:value":value`. Returns null for malformed lines. */
export function parseProperty(line: string): IcsProperty | null {
  let inQuotes = false
  let colon = -1
  const semis: number[] = []
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch === ';') semis.push(i)
    else if (!inQuotes && ch === ':') {
      colon = i
      break
    }
  }
  if (colon < 1) return null
  const head = line.slice(0, colon)
  const cuts = [...semis, colon]
  const name = head.slice(0, cuts[0]).trim().toUpperCase()
  if (!name) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < semis.length; i++) {
    const part = line.slice(semis[i] + 1, cuts[i + 1])
    const eq = part.indexOf('=')
    if (eq < 0) continue
    params[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value: line.slice(colon + 1) }
}

/** Unescapes an iCalendar TEXT value. */
export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch))
}

/* ------------------------------------------------------------------ */
/* Dates and time zones                                                */
/* ------------------------------------------------------------------ */

interface DateFields {
  y: number
  mo: number // 1..12
  d: number
  h: number
  mi: number
  s: number
}

interface IcsDate {
  fields: DateFields
  allDay: boolean
  /** 'UTC', an IANA zone name, or null for floating (local) time */
  zone: string | null
}

function localZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat | null>()

function zoneFormatter(tz: string): Intl.DateTimeFormat | null {
  if (formatterCache.has(tz)) return formatterCache.get(tz) ?? null
  let fmt: Intl.DateTimeFormat | null = null
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
  } catch {
    fmt = null // unknown (non-IANA) zone
  }
  formatterCache.set(tz, fmt)
  return fmt
}

/** Offset (ms) of `tz` from UTC at the given instant. */
function zoneOffsetMs(fmt: Intl.DateTimeFormat, instantMs: number): number {
  const parts: Record<string, number> = {}
  for (const p of fmt.formatToParts(new Date(instantMs))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second)
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

function fieldsUtcMs(f: DateFields): number {
  return Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s)
}

/** Converts wall-clock fields in a zone to an instant. */
function toInstant(f: DateFields, zone: string | null, allDay = false): Date {
  if (zone === 'UTC' && !allDay) return new Date(fieldsUtcMs(f))
  const fmt = !allDay && zone && zone !== localZone() ? zoneFormatter(zone) : null
  if (!fmt) return new Date(f.y, f.mo - 1, f.d, f.h, f.mi, f.s)
  const guess = fieldsUtcMs(f)
  const off1 = zoneOffsetMs(fmt, guess)
  let t = guess - off1
  const off2 = zoneOffsetMs(fmt, t)
  if (off2 !== off1) t = guess - off2
  return new Date(t)
}

function addDaysToFields(f: DateFields, days: number): DateFields {
  const d = new Date(Date.UTC(f.y, f.mo - 1, f.d + days))
  return { ...f, y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() }
}

/** 0 = Monday … 6 = Sunday for a calendar date */
function weekdayOf(f: DateFields): number {
  return (new Date(Date.UTC(f.y, f.mo - 1, f.d)).getUTCDay() + 6) % 7
}

function compareDate(a: DateFields, b: DateFields): number {
  return a.y - b.y || a.mo - b.mo || a.d - b.d
}

const DATE_RE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/

/** Parses a DATE or DATE-TIME value with its parameters. */
function parseDateValue(value: string, params: Record<string, string>): IcsDate | null {
  const m = DATE_RE.exec(value.trim())
  if (!m) return null
  const isDate = params.VALUE === 'DATE' || m[4] === undefined
  const fields: DateFields = {
    y: Number(m[1]),
    mo: Number(m[2]),
    d: Number(m[3]),
    h: isDate ? 0 : Number(m[4]),
    mi: isDate ? 0 : Number(m[5]),
    s: isDate ? 0 : Number(m[6] ?? 0),
  }
  if (isDate) return { fields, allDay: true, zone: null }
  const zone = m[7] ? 'UTC' : (params.TZID ?? null)
  return { fields, allDay: false, zone }
}

function dateToInstant(d: IcsDate): Date {
  return toInstant(d.fields, d.zone, d.allDay)
}

/** Parses an RFC 5545 DURATION (`P1W`, `PT1H30M`, `P1DT2H`, `-PT15M`) into milliseconds. */
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim())
  if (!m || value.trim() === 'P' || /T$/.test(value.trim())) return null
  const [, sign, w, d, h, mi, s] = m
  const ms =
    Number(w ?? 0) * WEEK_MS +
    Number(d ?? 0) * DAY_MS +
    Number(h ?? 0) * 3_600_000 +
    Number(mi ?? 0) * 60_000 +
    Number(s ?? 0) * 1000
  return sign === '-' ? -ms : ms
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/** Keyword stems matched at the start of a word (Unicode-aware, case-insensitive). */
function stems(...words: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join('|')})`, 'iu')
}

/**
 * Ordered from specific to generic: a "Fitness24 — Yoga" booking is a class, not a gym session,
 * and "Aqua aerobics" is a swim. Within each field the first matching rule wins.
 */
const KIND_RULES: [EventKind, RegExp][] = [
  ['swim', stems('swim', 'pool', 'aqua', 'бассейн', 'плаван', 'аква')],
  ['bike', stems('bike', 'cycling', 'spinning', 'вело', 'сайкл', 'спиннинг')],
  ['run', stems('run', 'jogging', 'бег', 'пробежк')],
  [
    'class',
    stems(
      'yoga',
      'pilates',
      'stretch',
      'crossfit',
      'hiit',
      'box',
      'group',
      'йог',
      'пилатес',
      'растяж',
      'кроссфит',
      'бокс',
      'групп',
      'заняти',
    ),
  ],
  ['gym', stems('gym', 'fitness', 'workout', 'зал', 'фитнес', 'тренаж', 'тренировк', 'силов')],
]

const ONEFIT_RE = /onefit/i

/**
 * Classifies an event by keywords (ru/en). The title is checked first, then the location, then the
 * description, so the event name beats a venue called "… Fitness". A OneFit booking with no other
 * hint is treated as a gym visit.
 */
export function classifyEvent(title: string, location?: string, description?: string): EventKind {
  for (const field of [title, location, description]) {
    if (!field) continue
    for (const [kind, re] of KIND_RULES) if (re.test(field)) return kind
  }
  if ([title, location, description].some((f) => f && ONEFIT_RE.test(f))) return 'gym'
  return 'other'
}

/* ------------------------------------------------------------------ */
/* Weekly recurrence                                                   */
/* ------------------------------------------------------------------ */

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const SUPPORTED_RRULE_KEYS = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL', 'WKST'])

interface WeeklyRule {
  interval: number
  byDay: number[] | null
  count?: number
  until?: { value: string }
  wkst: number
}

/** Parses a RRULE; returns null when it is not a plain weekly rule we can expand. */
export function parseWeeklyRule(rule: string): WeeklyRule | null {
  const parts: Record<string, string> = {}
  for (const piece of rule.split(';')) {
    const eq = piece.indexOf('=')
    if (eq < 0) continue
    parts[piece.slice(0, eq).trim().toUpperCase()] = piece.slice(eq + 1).trim()
  }
  if (parts.FREQ?.toUpperCase() !== 'WEEKLY') return null
  if (Object.keys(parts).some((k) => !SUPPORTED_RRULE_KEYS.has(k))) return null
  let byDay: number[] | null = null
  if (parts.BYDAY) {
    byDay = []
    for (const code of parts.BYDAY.toUpperCase().split(',')) {
      const idx = WEEKDAY_CODES.indexOf(code.trim())
      if (idx < 0) return null // ordinals like "1MO" are not weekly-simple
      byDay.push(idx)
    }
  }
  const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1
  const count = parts.COUNT ? Number(parts.COUNT) : undefined
  if (!Number.isInteger(interval) || interval < 1) return null
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) return null
  const wkst = parts.WKST ? WEEKDAY_CODES.indexOf(parts.WKST.toUpperCase()) : 0
  return {
    interval,
    byDay,
    count,
    until: parts.UNTIL ? { value: parts.UNTIL } : undefined,
    wkst: wkst < 0 ? 0 : wkst,
  }
}

/**
 * Start fields of every occurrence (DTSTART first) up to COUNT / UNTIL / `horizon`.
 * Occurrences are generated in the event's wall-clock time so DST changes keep the local hour.
 */
function expandWeekly(rule: WeeklyRule, start: IcsDate, horizon: Date): DateFields[] {
  const zone = start.zone
  let untilMs = Infinity
  if (rule.until) {
    const u = parseDateValue(rule.until.value, {})
    if (u) {
      untilMs = u.allDay
        ? toInstant(addDaysToFields(u.fields, 1), zone, start.allDay).getTime() - 1
        : toInstant(u.fields, u.zone ?? zone).getTime()
    }
  }
  const limitMs = Math.min(untilMs, horizon.getTime())
  const days = [...(rule.byDay ?? [weekdayOf(start.fields)])]
    .map((wd) => (wd - rule.wkst + 7) % 7)
    .sort((a, b) => a - b)
  const weekStart = addDaysToFields(start.fields, -((weekdayOf(start.fields) - rule.wkst + 7) % 7))

  const out: DateFields[] = [start.fields]
  for (let week = 0; week < MAX_WEEKS; week += rule.interval) {
    for (const offset of days) {
      const f = addDaysToFields(weekStart, week * 7 + offset)
      if (compareDate(f, start.fields) <= 0) continue // DTSTART already emitted
      if (rule.count !== undefined && out.length >= rule.count) return out
      if (toInstant(f, zone, start.allDay).getTime() > limitMs) return out
      out.push(f)
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* VEVENT → CalendarEvent                                              */
/* ------------------------------------------------------------------ */

type RawEvent = Map<string, IcsProperty[]>

function first(ev: RawEvent, name: string): IcsProperty | undefined {
  return ev.get(name)?.[0]
}

function textProp(ev: RawEvent, name: string): string | undefined {
  const p = first(ev, name)
  if (!p) return undefined
  const v = unescapeText(p.value).trim()
  return v || undefined
}

/** Small stable hash for events without a UID (djb2). */
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function readEvents(lines: string[]): RawEvent[] {
  const events: RawEvent[] = []
  let current: RawEvent | null = null
  let depth = 0 // nesting inside the current VEVENT (VALARM etc.)
  for (const line of lines) {
    const prop = parseProperty(line)
    if (!prop) continue
    const value = prop.value.trim().toUpperCase()
    if (prop.name === 'BEGIN') {
      if (current) depth++
      else if (value === 'VEVENT') current = new Map()
      continue
    }
    if (prop.name === 'END') {
      if (current && depth > 0) depth--
      else if (current && value === 'VEVENT') {
        events.push(current)
        current = null
      }
      continue
    }
    if (!current || depth > 0) continue
    const list = current.get(prop.name)
    if (list) list.push(prop)
    else current.set(prop.name, [prop])
  }
  return events
}

/**
 * Parses iCalendar text into calendar events. Recurring weekly events are expanded into one
 * event per occurrence with id `UID#<occurrence start ISO>`; overrides (`RECURRENCE-ID`) use the
 * same id and replace the generated occurrence. Ids are stable, so re-importing the same file
 * upserts instead of duplicating. Result is sorted by start time.
 */
export function parseIcs(text: string, source: string, options: ParseOptions = {}): CalendarEvent[] {
  const now = options.now ?? new Date()
  const horizon = new Date(now.getTime() + (options.horizonWeeks ?? 8) * WEEK_MS)
  const windowStart = now.getTime() - (options.lookbackWeeks ?? 8) * WEEK_MS
  const importedAt = now.toISOString()

  const byId = new Map<string, CalendarEvent>()
  const overrides = new Map<string, CalendarEvent>()
  const cancelled = new Set<string>()

  for (const ev of readEvents(unfoldLines(text))) {
    const dtstartProp = first(ev, 'DTSTART')
    const start = dtstartProp && parseDateValue(dtstartProp.value, dtstartProp.params)
    if (!start) continue

    const title = textProp(ev, 'SUMMARY') ?? 'Без названия'
    const location = textProp(ev, 'LOCATION')
    const description = textProp(ev, 'DESCRIPTION')
    const uid = first(ev, 'UID')?.value.trim() || `nouid-${hash(`${title}|${dtstartProp.value}`)}`
    const isCancelled = first(ev, 'STATUS')?.value.trim().toUpperCase() === 'CANCELLED'

    const startDate = dateToInstant(start)
    let endDate: Date | null = null
    const dtendProp = first(ev, 'DTEND')
    const end = dtendProp && parseDateValue(dtendProp.value, dtendProp.params)
    if (end) endDate = dateToInstant(end)
    else {
      const durProp = first(ev, 'DURATION')
      const dur = durProp ? parseDuration(durProp.value) : null
      if (dur !== null) {
        endDate = start.allDay
          ? toInstant(addDaysToFields(start.fields, Math.round(dur / DAY_MS)), null, true)
          : new Date(startDate.getTime() + dur)
      } else if (start.allDay) {
        endDate = toInstant(addDaysToFields(start.fields, 1), null, true)
      }
    }
    if (!endDate || endDate < startDate) endDate = startDate
    const durationMs = endDate.getTime() - startDate.getTime()
    const durationDays = Math.round(durationMs / DAY_MS)

    const kind = classifyEvent(title, location, description)
    const make = (id: string, s: Date, e: Date): CalendarEvent => ({
      id,
      title,
      startAt: s.toISOString(),
      endAt: e.toISOString(),
      allDay: start.allDay,
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      source,
      kind,
      importedAt,
    })

    const recProp = first(ev, 'RECURRENCE-ID')
    const recId = recProp && parseDateValue(recProp.value, recProp.params)
    if (recId) {
      const id = `${uid}#${dateToInstant(recId).toISOString()}`
      if (isCancelled) cancelled.add(id)
      else overrides.set(id, make(id, startDate, endDate))
      continue
    }
    if (isCancelled) continue

    const rruleProp = first(ev, 'RRULE')
    const rule = rruleProp ? parseWeeklyRule(rruleProp.value) : null
    if (!rule) {
      // Non-recurring, or a rule we do not expand: keep the first occurrence only.
      const id = rruleProp ? `${uid}#${startDate.toISOString()}` : uid
      byId.set(id, make(id, startDate, endDate))
      continue
    }

    const exdates = new Set<string>()
    for (const ex of ev.get('EXDATE') ?? []) {
      for (const v of ex.value.split(',')) {
        const d = parseDateValue(v, ex.params)
        if (d) exdates.add(dateToInstant(d).toISOString())
      }
    }
    for (const f of expandWeekly(rule, start, horizon)) {
      const s = toInstant(f, start.zone, start.allDay)
      const e = start.allDay
        ? toInstant(addDaysToFields(f, durationDays), null, true)
        : new Date(s.getTime() + durationMs)
      if (e.getTime() < windowStart) continue
      const id = `${uid}#${s.toISOString()}`
      if (exdates.has(s.toISOString())) continue
      byId.set(id, make(id, s, e))
    }
  }

  for (const [id, ev] of overrides) byId.set(id, ev)
  for (const id of cancelled) byId.delete(id)
  return [...byId.values()].sort((a, b) => a.startAt.localeCompare(b.startAt))
}

/** True when the text looks like an iCalendar document. */
export function looksLikeIcs(text: string): boolean {
  return /BEGIN:VCALENDAR/i.test(text) || /BEGIN:VEVENT/i.test(text)
}
