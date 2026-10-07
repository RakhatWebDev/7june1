import { db as defaultDb, type FormaDB } from '../../db'
import type { CalendarEvent, CalendarFeed } from '../../db/types'
import { newId } from '../../lib/id'
import { looksLikeIcs, parseIcs } from './ics'
import { upcomingEvents } from './meta'

/** Days counted as "ближайшие" on the calendar page and in import summaries. */
export const UPCOMING_DAYS = 14
export const PAST_DAYS = 7

export const CORS_MESSAGE =
  'Календарь не отдаёт данные браузеру напрямую (CORS). Скачайте .ics и импортируйте файлом'

export interface ImportResult {
  total: number
  upcoming: number
}

interface Opts {
  database?: FormaDB
  now?: Date
}

function summarize(events: CalendarEvent[], now: Date): ImportResult {
  return { total: events.length, upcoming: upcomingEvents(events, now, UPCOMING_DAYS).length }
}

/** Parses .ics text and upserts events by id: importing the same file twice adds nothing. */
export async function importIcsText(text: string, source: string, opts: Opts = {}): Promise<ImportResult> {
  const { database = defaultDb, now = new Date() } = opts
  if (!looksLikeIcs(text)) throw new Error('Это не файл календаря (.ics)')
  const events = parseIcs(text, source, { now })
  await database.calendarEvents.bulkPut(events)
  return summarize(events, now)
}

/** Deletes every event imported from `source`. Returns the number removed. */
export function deleteSource(source: string, database: FormaDB = defaultDb): Promise<number> {
  return database.calendarEvents.where('source').equals(source).delete()
}

/** Removes a feed together with its events. */
export async function deleteFeed(feed: CalendarFeed, database: FormaDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.calendarEvents, database.calendarFeeds, async () => {
    await database.calendarEvents.where('source').equals(feed.label).delete()
    await database.calendarFeeds.delete(feed.id)
  })
}

/** Accepts http(s) and webcal links; returns a fetchable https URL or null. */
export function normalizeFeedUrl(input: string): string | null {
  const trimmed = input.trim().replace(/^webcals?:\/\//i, 'https://')
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Human label for a feed URL; also used as the events' `source`. */
export function feedLabel(url: string): string {
  try {
    const u = new URL(url)
    const google = /\/calendar\/ical\/([^/]+)\//.exec(u.pathname)
    if (u.hostname.endsWith('calendar.google.com') && google) {
      return `Google: ${decodeURIComponent(google[1])}`
    }
    if (u.hostname.endsWith('icloud.com')) return 'iCloud'
    return u.hostname
  } catch {
    return url
  }
}

export class FeedError extends Error {}

/** Downloads feed text, translating network/CORS/HTTP failures into user-facing messages. */
export async function fetchFeedText(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let res: Response
  try {
    res = await fetchImpl(url, { cache: 'no-store' })
  } catch {
    // Browsers report CORS rejections and offline errors identically (TypeError).
    throw new FeedError(CORS_MESSAGE)
  }
  if (!res.ok) throw new FeedError(`Сервер календаря ответил ошибкой ${res.status}. Проверьте адрес`)
  const text = await res.text()
  if (!looksLikeIcs(text)) throw new FeedError('По этому адресу нет календаря в формате iCal (.ics)')
  return text
}

/** Finds a feed by URL or creates it. */
export async function upsertFeed(url: string, database: FormaDB = defaultDb): Promise<CalendarFeed> {
  const existing = (await database.calendarFeeds.toArray()).find((f) => f.url === url)
  if (existing) return existing
  const feed: CalendarFeed = { id: newId(), label: feedLabel(url), url }
  await database.calendarFeeds.put(feed)
  return feed
}

/**
 * Fetches a feed and replaces its events (a sync is authoritative: cancelled bookings disappear).
 * Records `lastSyncAt` on success and `lastError` on failure; failures are re-thrown.
 */
export async function syncFeed(
  feed: CalendarFeed,
  opts: Opts & { fetchImpl?: typeof fetch } = {},
): Promise<ImportResult> {
  const { database = defaultDb, now = new Date(), fetchImpl } = opts
  try {
    const text = await fetchFeedText(feed.url, fetchImpl)
    const events = parseIcs(text, feed.label, { now })
    await database.transaction('rw', database.calendarEvents, database.calendarFeeds, async () => {
      await database.calendarEvents.where('source').equals(feed.label).delete()
      await database.calendarEvents.bulkPut(events)
      await database.calendarFeeds.put({ ...feed, lastSyncAt: now.toISOString(), lastError: undefined })
    })
    return summarize(events, now)
  } catch (err) {
    const message = err instanceof FeedError ? err.message : 'Не удалось обработать календарь'
    await database.calendarFeeds.put({ ...feed, lastError: message })
    throw new FeedError(message)
  }
}
