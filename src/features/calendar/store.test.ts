import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormaDB } from '../../db'
import {
  CORS_MESSAGE,
  deleteFeed,
  deleteSource,
  feedLabel,
  importIcsText,
  normalizeFeedUrl,
  syncFeed,
  upsertFeed,
} from './store'

const NOW = new Date('2026-10-07T08:00:00Z')

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:onefit-1@onefit.app',
  'DTSTART:20261008T153000Z',
  'DTEND:20261008T163000Z',
  'SUMMARY:OneFit: Fitness24 — Gym',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:weekly-swim@google.com',
  'DTSTART:20261009T043000Z',
  'DTEND:20261009T053000Z',
  'RRULE:FREQ=WEEKLY;COUNT=3',
  'SUMMARY:Бассейн',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:old@google.com',
  'DTSTART:20260901T100000Z',
  'SUMMARY:Старое',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

let n = 0
const freshDb = () => new FormaDB(`test-calendar-store-${++n}-${Date.now()}`)

function okResponse(body: string) {
  return { ok: true, status: 200, text: async () => body } as unknown as Response
}

afterEach(() => vi.restoreAllMocks())

describe('importIcsText', () => {
  it('importing the same text twice does not change the number of events', async () => {
    const db = freshDb()
    const first = await importIcsText(ICS, 'basic.ics', { database: db, now: NOW })
    expect(first).toEqual({ total: 5, upcoming: 3 }) // gym + 2 swims within 14 days (3rd is 23 Oct)
    expect(await db.calendarEvents.count()).toBe(5)
    await importIcsText(ICS, 'basic.ics', { database: db, now: NOW })
    expect(await db.calendarEvents.count()).toBe(5)
  })

  it('rejects text that is not a calendar', async () => {
    await expect(
      importIcsText('hello', 'x.txt', { database: freshDb(), now: NOW }),
    ).rejects.toThrow(/не файл/)
  })

  it('deletes all events of one source only', async () => {
    const db = freshDb()
    await importIcsText(ICS, 'a.ics', { database: db, now: NOW })
    await db.calendarEvents.put({
      id: 'other',
      title: 't',
      startAt: NOW.toISOString(),
      endAt: NOW.toISOString(),
      allDay: false,
      source: 'b.ics',
      kind: 'other',
      importedAt: NOW.toISOString(),
    })
    expect(await deleteSource('a.ics', db)).toBe(5)
    expect((await db.calendarEvents.toArray()).map((e) => e.id)).toEqual(['other'])
  })
})

describe('feeds', () => {
  const GOOGLE =
    'https://calendar.google.com/calendar/ical/rakhat%40gmail.com/private-abc123/basic.ics'

  it('normalizes and labels URLs', () => {
    expect(normalizeFeedUrl(' webcal://p01-caldav.icloud.com/published/2/abc ')).toBe(
      'https://p01-caldav.icloud.com/published/2/abc',
    )
    expect(normalizeFeedUrl('ftp://x')).toBeNull()
    expect(normalizeFeedUrl('not a url')).toBeNull()
    expect(feedLabel(GOOGLE)).toBe('Google: rakhat@gmail.com')
    expect(feedLabel('https://p01-caldav.icloud.com/x')).toBe('iCloud')
    expect(feedLabel('https://example.org/cal.ics')).toBe('example.org')
  })

  it('upsertFeed reuses an existing feed with the same URL', async () => {
    const db = freshDb()
    const a = await upsertFeed(GOOGLE, db)
    const b = await upsertFeed(GOOGLE, db)
    expect(b.id).toBe(a.id)
    expect(await db.calendarFeeds.count()).toBe(1)
  })

  it('sync stores events, sets lastSyncAt and replaces stale events of the feed', async () => {
    const db = freshDb()
    const feed = await upsertFeed(GOOGLE, db)
    const fetchImpl = vi.fn(async () => okResponse(ICS)) as unknown as typeof fetch
    expect(await syncFeed(feed, { database: db, now: NOW, fetchImpl })).toEqual({
      total: 5,
      upcoming: 3,
    })
    await db.calendarEvents.put({
      id: 'cancelled-booking',
      title: 'gone',
      startAt: NOW.toISOString(),
      endAt: NOW.toISOString(),
      allDay: false,
      source: feed.label,
      kind: 'gym',
      importedAt: NOW.toISOString(),
    })
    await syncFeed(feed, { database: db, now: NOW, fetchImpl })
    expect(await db.calendarEvents.count()).toBe(5)
    expect(await db.calendarEvents.get('cancelled-booking')).toBeUndefined()
    const saved = await db.calendarFeeds.get(feed.id)
    expect(saved?.lastSyncAt).toBe(NOW.toISOString())
    expect(saved?.lastError).toBeUndefined()
  })

  it('reports CORS/network failures with the import-by-file hint', async () => {
    const db = freshDb()
    const feed = await upsertFeed(GOOGLE, db)
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(syncFeed(feed, { database: db, now: NOW, fetchImpl })).rejects.toThrow(
      CORS_MESSAGE,
    )
    expect((await db.calendarFeeds.get(feed.id))?.lastError).toBe(CORS_MESSAGE)
    expect(await db.calendarEvents.count()).toBe(0)
  })

  it('reports HTTP errors and non-calendar responses', async () => {
    const db = freshDb()
    const feed = await upsertFeed(GOOGLE, db)
    const notFound = vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    })) as unknown as typeof fetch
    await expect(syncFeed(feed, { database: db, fetchImpl: notFound })).rejects.toThrow(/404/)
    const html = vi.fn(async () => okResponse('<html></html>')) as unknown as typeof fetch
    await expect(syncFeed(feed, { database: db, fetchImpl: html })).rejects.toThrow(/iCal/)
  })

  it('deleteFeed removes the feed and its events', async () => {
    const db = freshDb()
    const feed = await upsertFeed(GOOGLE, db)
    await syncFeed(feed, {
      database: db,
      now: NOW,
      fetchImpl: (async () => okResponse(ICS)) as unknown as typeof fetch,
    })
    await deleteFeed(feed, db)
    expect(await db.calendarFeeds.count()).toBe(0)
    expect(await db.calendarEvents.count()).toBe(0)
  })
})
