import { describe, expect, it } from 'vitest'
import {
  classifyEvent,
  parseDuration,
  parseIcs,
  parseProperty,
  parseWeeklyRule,
  unescapeText,
  unfoldLines,
} from './ics'

const crlf = (lines: string[]) => lines.join('\r\n') + '\r\n'

/** Fragment of a real Google Calendar export (basic.ics), CRLF line endings, 75-octet folding. */
const GOOGLE_EXPORT = crlf([
  'BEGIN:VCALENDAR',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'VERSION:2.0',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:rakhat@gmail.com',
  'X-WR-TIMEZONE:Europe/Moscow',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Moscow',
  'X-LIC-LOCATION:Europe/Moscow',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0300',
  'TZNAME:MSK',
  'DTSTART:19700101T000000',
  'END:STANDARD',
  'END:VTIMEZONE',
  // OneFit booking, UTC times, folded DESCRIPTION, escaped commas, VALARM with its own DESCRIPTION
  'BEGIN:VEVENT',
  'DTSTART:20261008T153000Z',
  'DTEND:20261008T163000Z',
  'DTSTAMP:20261007T090000Z',
  'UID:onefit-booking-5521873@onefit.app',
  'CREATED:20261006T120000Z',
  'DESCRIPTION:Бронирование через OneFit.\\nПриходите за 10 минут до начала. Отм',
  ' ена не позднее чем за 2 часа\\, иначе визит сгорит.',
  'LAST-MODIFIED:20261006T120000Z',
  'LOCATION:Fitness24\\, пр. Абая 52\\, Алматы',
  'SEQUENCE:0',
  'STATUS:CONFIRMED',
  'SUMMARY:OneFit: Fitness24 — Gym',
  'TRANSP:OPAQUE',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'DESCRIPTION:This is an event reminder',
  'TRIGGER:-P0DT0H30M0S',
  'END:VALARM',
  'END:VEVENT',
  // Weekly swim with TZID, BYDAY, UNTIL, EXDATE and a moved occurrence
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Moscow:20260928T073000',
  'DTEND;TZID=Europe/Moscow:20260928T083000',
  'RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20261031T205959Z;BYDAY=MO,WE,FR',
  'EXDATE;TZID=Europe/Moscow:20261005T073000',
  'DTSTAMP:20261007T090000Z',
  'UID:7kukuqrfedlgf4hjj3n3l0b1qm@google.com',
  'SUMMARY:Утреннее плавание',
  'LOCATION:Aqua Club',
  'STATUS:CONFIRMED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Moscow:20261009T090000',
  'DTEND;TZID=Europe/Moscow:20261009T100000',
  'RECURRENCE-ID;TZID=Europe/Moscow:20261009T073000',
  'UID:7kukuqrfedlgf4hjj3n3l0b1qm@google.com',
  'SUMMARY:Утреннее плавание (перенос)',
  'LOCATION:Aqua Club',
  'END:VEVENT',
  // All-day event
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261011',
  'DTEND;VALUE=DATE:20261012',
  'UID:3m1n0p2q@google.com',
  'SUMMARY:День бега — Almaty Marathon',
  'END:VEVENT',
  // Cancelled booking
  'BEGIN:VEVENT',
  'DTSTART:20261009T060000Z',
  'DTEND:20261009T070000Z',
  'UID:onefit-booking-5521999@onefit.app',
  'SUMMARY:OneFit: Yoga Space — Hatha',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'END:VCALENDAR',
])

const NOW = new Date('2026-10-07T00:00:00Z')

function ev(text: string, extra: string[] = [], now = NOW) {
  return parseIcs(crlf(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:x@test', ...extra, 'END:VEVENT', 'END:VCALENDAR']), text, {
    now,
  })
}

describe('low-level helpers', () => {
  it('unfolds CRLF + space/tab continuations', () => {
    expect(unfoldLines('SUMMARY:Hel\r\n lo\r\n\tWorld\r\nUID:1\r\n')).toEqual(['SUMMARY:HelloWorld', 'UID:1'])
    expect(unfoldLines('A:1\nB:2\n C')).toEqual(['A:1', 'B:2C'])
  })

  it('parses properties with (quoted) parameters', () => {
    expect(parseProperty('DTSTART;TZID=Europe/Moscow:20261008T073000')).toEqual({
      name: 'DTSTART',
      params: { TZID: 'Europe/Moscow' },
      value: '20261008T073000',
    })
    expect(parseProperty('ATTENDEE;CN="Doe: John";ROLE=CHAIR:mailto:j@x.io')).toEqual({
      name: 'ATTENDEE',
      params: { CN: 'Doe: John', ROLE: 'CHAIR' },
      value: 'mailto:j@x.io',
    })
    expect(parseProperty('garbage')).toBeNull()
  })

  it('unescapes TEXT values', () => {
    expect(unescapeText('a\\, b\\; c\\nd\\Ne\\\\f')).toBe('a, b; c\nd\ne\\f')
  })

  it('parses durations', () => {
    expect(parseDuration('PT1H30M')).toBe(90 * 60_000)
    expect(parseDuration('P1DT2H')).toBe(26 * 3_600_000)
    expect(parseDuration('P1W')).toBe(7 * 86_400_000)
    expect(parseDuration('-PT15M')).toBe(-15 * 60_000)
    expect(parseDuration('P')).toBeNull()
    expect(parseDuration('nonsense')).toBeNull()
  })

  it('accepts only plain weekly rules', () => {
    expect(parseWeeklyRule('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5')).toMatchObject({ byDay: [0, 2], count: 5, interval: 1 })
    expect(parseWeeklyRule('FREQ=MONTHLY;BYMONTHDAY=1')).toBeNull()
    expect(parseWeeklyRule('FREQ=WEEKLY;BYDAY=1MO')).toBeNull()
    expect(parseWeeklyRule('FREQ=WEEKLY;BYSETPOS=1;BYDAY=MO')).toBeNull()
  })
})

describe('parseIcs — Google Calendar export', () => {
  const events = parseIcs(GOOGLE_EXPORT, 'basic.ics', { now: NOW })
  const byTitle = (t: string) => events.filter((e) => e.title === t)

  it('reads the OneFit booking with unfolding, escapes and UTC times', () => {
    const [gym] = byTitle('OneFit: Fitness24 — Gym')
    expect(gym).toEqual({
      id: 'onefit-booking-5521873@onefit.app',
      title: 'OneFit: Fitness24 — Gym',
      startAt: '2026-10-08T15:30:00.000Z',
      endAt: '2026-10-08T16:30:00.000Z',
      allDay: false,
      location: 'Fitness24, пр. Абая 52, Алматы',
      description:
        'Бронирование через OneFit.\nПриходите за 10 минут до начала. Отмена не позднее чем за 2 часа, иначе визит сгорит.',
      source: 'basic.ics',
      kind: 'gym',
      importedAt: NOW.toISOString(),
    })
  })

  it('ignores VALARM properties inside the event', () => {
    expect(events.some((e) => e.description === 'This is an event reminder')).toBe(false)
  })

  it('expands the weekly RRULE (BYDAY, UNTIL, EXDATE) with TZID conversion', () => {
    const swims = events.filter((e) => e.id.startsWith('7kukuqrfedlgf4hjj3n3l0b1qm@google.com#'))
    // Mo/We/Fr from 28 Sep to 30 Oct = 15 dates, minus 1 EXDATE
    expect(swims).toHaveLength(14)
    // 07:30 Moscow (UTC+3) = 04:30Z
    expect(swims[0].startAt).toBe('2026-09-28T04:30:00.000Z')
    expect(swims[0].endAt).toBe('2026-09-28T05:30:00.000Z')
    expect(swims.map((e) => e.startAt.slice(0, 10))).not.toContain('2026-10-05')
    expect(swims.at(-1)?.startAt).toBe('2026-10-30T04:30:00.000Z')
    expect(swims.every((e) => e.kind === 'swim' && e.location === 'Aqua Club')).toBe(true)
  })

  it('replaces a moved occurrence via RECURRENCE-ID', () => {
    const moved = events.find((e) => e.id === '7kukuqrfedlgf4hjj3n3l0b1qm@google.com#2026-10-09T04:30:00.000Z')
    expect(moved?.title).toBe('Утреннее плавание (перенос)')
    expect(moved?.startAt).toBe('2026-10-09T06:00:00.000Z')
    expect(events.filter((e) => e.startAt.startsWith('2026-10-09T04:30'))).toHaveLength(0)
  })

  it('reads VALUE=DATE as an all-day event at local midnight', () => {
    const [run] = byTitle('День бега — Almaty Marathon')
    expect(run.allDay).toBe(true)
    expect(run.startAt).toBe(new Date(2026, 9, 11).toISOString())
    expect(run.endAt).toBe(new Date(2026, 9, 12).toISOString())
    expect(run.kind).toBe('run')
  })

  it('drops cancelled events and sorts by start', () => {
    expect(events.some((e) => e.title.includes('Hatha'))).toBe(false)
    const starts = events.map((e) => e.startAt)
    expect([...starts].sort()).toEqual(starts)
  })

  it('produces identical ids on re-parse (stable upserts)', () => {
    const again = parseIcs(GOOGLE_EXPORT, 'basic.ics', { now: NOW })
    expect(again.map((e) => e.id)).toEqual(events.map((e) => e.id))
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length)
  })
})

describe('parseIcs — edge cases', () => {
  it('uses DURATION when DTEND is missing', () => {
    const [e] = ev('d.ics', ['DTSTART:20261012T150000Z', 'DURATION:PT1H30M', 'SUMMARY:Pilates'])
    expect(e.endAt).toBe('2026-10-12T16:30:00.000Z')
    expect(e.kind).toBe('class')
  })

  it('defaults an all-day event without DTEND to one day', () => {
    const [e] = ev('d.ics', ['DTSTART;VALUE=DATE:20261012', 'SUMMARY:Отпуск'])
    expect(e.endAt).toBe(new Date(2026, 9, 13).toISOString())
  })

  it('treats floating times and the local TZID as local wall-clock time', () => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone
    const expected = new Date(2026, 9, 12, 18, 0).toISOString()
    expect(ev('f.ics', ['DTSTART:20261012T180000', 'SUMMARY:A'])[0].startAt).toBe(expected)
    expect(ev('f.ics', [`DTSTART;TZID=${local}:20261012T180000`, 'SUMMARY:A'])[0].startAt).toBe(expected)
  })

  it('converts IANA zones across DST and falls back to local for unknown TZIDs', () => {
    // Berlin is UTC+2 in summer, UTC+1 in winter
    expect(ev('b.ics', ['DTSTART;TZID=Europe/Berlin:20260715T100000'])[0].startAt).toBe('2026-07-15T08:00:00.000Z')
    expect(ev('b.ics', ['DTSTART;TZID=Europe/Berlin:20261215T100000'])[0].startAt).toBe('2026-12-15T09:00:00.000Z')
    expect(ev('w.ics', ['DTSTART;TZID=W. Europe Standard Time:20261215T100000'])[0].startAt).toBe(
      new Date(2026, 11, 15, 10).toISOString(),
    )
  })

  it('unescapes \\, \\; and \\n in SUMMARY/LOCATION/DESCRIPTION', () => {
    const [e] = ev('e.ics', [
      'DTSTART:20261012T150000Z',
      'SUMMARY:Stretch\\, Core \\; Balance',
      'LOCATION:Зал 2\\, этаж 3',
      'DESCRIPTION:Строка 1\\nСтрока 2',
    ])
    expect(e.title).toBe('Stretch, Core ; Balance')
    expect(e.location).toBe('Зал 2, этаж 3')
    expect(e.description).toBe('Строка 1\nСтрока 2')
  })

  it('expands weekly COUNT rules', () => {
    const list = ev('c.ics', ['DTSTART:20261006T180000Z', 'DTEND:20261006T190000Z', 'RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=TU,TH'])
    expect(list.map((e) => e.startAt.slice(0, 10))).toEqual(['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15'])
  })

  it('expands open-ended weekly rules 8 weeks ahead and honours INTERVAL', () => {
    const weekly = ev('o.ics', ['DTSTART:20261010T090000Z', 'RRULE:FREQ=WEEKLY;BYDAY=SA'])
    expect(weekly).toHaveLength(8) // 10 Oct … 28 Nov; 5 Dec is past now + 8 weeks
    expect(weekly.at(-1)?.startAt).toBe('2026-11-28T09:00:00.000Z')
    const biweekly = ev('o.ics', ['DTSTART:20261010T090000Z', 'RRULE:FREQ=WEEKLY;INTERVAL=2'])
    expect(biweekly.map((e) => e.startAt.slice(0, 10))).toEqual(['2026-10-10', '2026-10-24', '2026-11-07', '2026-11-21'])
  })

  it('keeps wall-clock time of weekly events across a DST change', () => {
    const list = ev('dst.ics', ['DTSTART;TZID=Europe/Berlin:20261019T180000', 'RRULE:FREQ=WEEKLY;COUNT=2'])
    expect(list.map((e) => e.startAt)).toEqual(['2026-10-19T16:00:00.000Z', '2026-10-26T17:00:00.000Z'])
  })

  it('drops recurrences older than the lookback window', () => {
    const list = ev('old.ics', ['DTSTART:20200106T090000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO'])
    expect(list[0].startAt >= '2026-08-12').toBe(true)
    expect(list.length).toBeLessThanOrEqual(17)
  })

  it('keeps only the first occurrence of unsupported rules', () => {
    const list = ev('m.ics', ['DTSTART:20261012T150000Z', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=12'])
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('x@test#2026-10-12T15:00:00.000Z')
  })

  it('skips events without DTSTART and generates ids when UID is missing', () => {
    const text = crlf([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:No start',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART:20261012T150000Z',
      'SUMMARY:No uid',
      'END:VEVENT',
      'END:VCALENDAR',
    ])
    const a = parseIcs(text, 's', { now: NOW })
    expect(a).toHaveLength(1)
    expect(a[0].id).toMatch(/^nouid-/)
    expect(parseIcs(text, 's', { now: NOW })[0].id).toBe(a[0].id)
    expect(a[0].endAt).toBe(a[0].startAt)
  })

  it('accepts LF-only input and missing SUMMARY', () => {
    const [e] = parseIcs('BEGIN:VEVENT\nUID:1\nDTSTART:20261012T150000Z\nEND:VEVENT\n', 's', { now: NOW })
    expect(e.title).toBe('Без названия')
    expect(e.kind).toBe('other')
  })
})

describe('classifyEvent', () => {
  it.each([
    ['OneFit: Fitness24 — Gym', undefined, 'gym'],
    ['Тренажёрный зал', undefined, 'gym'],
    ['Силовая тренировка', undefined, 'gym'],
    ['OneFit: Yoga Space — Hatha yoga', undefined, 'class'],
    ['Fitness24 — Pilates', undefined, 'class'],
    ['Растяжка', undefined, 'class'],
    ['CrossFit WOD', undefined, 'class'],
    ['HIIT', undefined, 'class'],
    ['Boxing', undefined, 'class'],
    ['Групповое занятие', undefined, 'class'],
    ['Aqua aerobics', undefined, 'swim'],
    ['Бассейн', undefined, 'swim'],
    ['Swimming', undefined, 'swim'],
    ['Morning run', undefined, 'run'],
    ['Бег в парке', undefined, 'run'],
    ['Spinning', undefined, 'bike'],
    ['Велотренировка', undefined, 'bike'],
    ['Cycling', undefined, 'bike'],
    ['Встреча', 'Бассейн «Олимп»', 'swim'],
    ['OneFit: Studio 7', undefined, 'gym'],
    ['Brunch with Anna', undefined, 'other'],
    ['Созвон по проекту', 'Zoom', 'other'],
  ] as const)('%s / %s → %s', (title, location, kind) => {
    expect(classifyEvent(title, location, undefined)).toBe(kind)
  })

  it('prefers the title over location and description', () => {
    expect(classifyEvent('Yoga', 'Fitness24 Gym', 'swim after')).toBe('class')
    expect(classifyEvent('Встреча', undefined, 'Взять форму для зала')).toBe('gym')
  })
})
