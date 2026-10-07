import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { db } from '../../db'
import { CalendarPage } from './CalendarPage'
import { CORS_MESSAGE } from './store'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** iCalendar UTC stamp, e.g. 20261008T153000Z */
const stamp = (ms: number) =>
  new Date(Math.floor(ms / 60_000) * 60_000).toISOString().replace(/[-:]/g, '').replace('.000', '')

function buildIcs() {
  const now = Date.now()
  const vevent = (uid: string, start: number, summary: string, location?: string) => [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(start + HOUR)}`,
    `SUMMARY:${summary}`,
    ...(location ? [`LOCATION:${location}`] : []),
    'END:VEVENT',
  ]
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ...vevent('gym-1@onefit', now + 2 * DAY, 'OneFit: Fitness24 — Gym', 'Fitness24\\, пр. Абая 52'),
    ...vevent('swim-1@onefit', now + 3 * DAY, 'OneFit: Aqua Club — Бассейн'),
    ...vevent('past-1@onefit', now - 2 * DAY, 'OneFit: Yoga Space — Hatha yoga'),
    ...vevent('far-1@onefit', now + 30 * DAY, 'Далёкое событие'),
    'END:VCALENDAR',
  ].join('\r\n')
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CalendarPage />
    </MemoryRouter>,
  )
}

const fileInput = () => screen.getByLabelText('Импортировать .ics') as HTMLInputElement
const icsFile = () => new File([buildIcs()], 'basic.ics', { type: 'text/calendar' })

beforeEach(async () => {
  await db.calendarEvents.clear()
  await db.calendarFeeds.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('CalendarPage', () => {
  it('shows the empty state and collapsible instructions', async () => {
    renderPage()
    expect(await screen.findByText('Событий пока нет')).toBeInTheDocument()
    expect(screen.getByText('Как получить календарь (.ics)')).toBeInTheDocument()
    expect(screen.getByText(/Секретный адрес в формате iCal/)).toBeInTheDocument()
    expect(screen.getByText(/Файл → Экспорт/)).toBeInTheDocument()
    expect(fileInput()).toHaveAttribute('accept', '.ics,text/calendar')
  })

  it('imports a file, lists upcoming/past events with actions, and does not duplicate on re-import', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.upload(fileInput(), icsFile())
    expect(await screen.findByRole('status')).toHaveTextContent('Импортировано 4 события, из них ближайших 2')
    expect(await db.calendarEvents.count()).toBe(4)

    const upcoming = await screen.findByRole('region', { name: 'Ближайшие' })
    expect(await within(upcoming).findByText('OneFit: Fitness24 — Gym')).toBeInTheDocument()
    expect(within(upcoming).getByText(/Fitness24, пр\. Абая 52/)).toBeInTheDocument()
    expect(within(upcoming).getByRole('link', { name: 'Начать тренировку' })).toHaveAttribute('href', '/workouts')
    expect(within(upcoming).getByRole('link', { name: 'Записать активность' })).toHaveAttribute(
      'href',
      '/cardio/new?type=swim',
    )
    expect(within(upcoming).queryByText('Далёкое событие')).not.toBeInTheDocument()

    const past = screen.getByRole('region', { name: 'Прошедшие' })
    expect(within(past).getByText('OneFit: Yoga Space — Hatha yoga')).toBeInTheDocument()
    expect(within(past).getByRole('link', { name: 'Записать активность' })).toHaveAttribute(
      'href',
      '/cardio/new?type=other',
    )

    await user.upload(fileInput(), icsFile())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Импортировано 4 события'))
    expect(await db.calendarEvents.count()).toBe(4)
  })

  it('filters by kind with chips', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.upload(fileInput(), icsFile())
    await screen.findByText('OneFit: Fitness24 — Gym')
    await user.click(screen.getByRole('button', { name: /Бассейн/ }))
    expect(screen.queryByText('OneFit: Fitness24 — Gym')).not.toBeInTheDocument()
    expect(screen.getByText('OneFit: Aqua Club — Бассейн')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Все' }))
    expect(screen.getByText('OneFit: Fitness24 — Gym')).toBeInTheDocument()
  })

  it('deletes all events of a source after confirmation', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.upload(fileInput(), icsFile())
    expect(await screen.findByText('basic.ics')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Удалить события' }))
    await user.click(screen.getByRole('button', { name: 'Да, удалить' }))
    expect(await screen.findByText('Событий пока нет')).toBeInTheDocument()
    expect(await db.calendarEvents.count()).toBe(0)
  })

  it('reports a file that is not a calendar', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.upload(fileInput(), new File(['just text'], 'notes.ics', { type: 'text/calendar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Это не файл календаря')
  })

  it('explains CORS failures of a feed subscription and remembers the feed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await user.type(
      screen.getByRole('textbox', { name: /Секретный адрес календаря/ }),
      'https://calendar.google.com/calendar/ical/me%40gmail.com/private-x/basic.ics',
    )
    await user.click(screen.getByRole('button', { name: 'Синхронизировать' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(CORS_MESSAGE)
    expect(await screen.findByText('Google: me@gmail.com')).toBeInTheDocument()
    const [feed] = await db.calendarFeeds.toArray()
    expect(feed.lastError).toBe(CORS_MESSAGE)
  })

  it('syncs a feed that allows browser access', async () => {
    const body = buildIcs()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, text: async () => body })),
    )
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByRole('textbox', { name: /Секретный адрес календаря/ }), 'webcal://example.org/cal.ics')
    await user.click(screen.getByRole('button', { name: 'Синхронизировать' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Импортировано 4 события, из них ближайших 2')
    expect(fetch).toHaveBeenCalledWith('https://example.org/cal.ics', expect.anything())
    const [feed] = await db.calendarFeeds.toArray()
    expect(feed.lastSyncAt).toBeTruthy()
    expect(await screen.findByText(/обновлено/)).toBeInTheDocument()
    expect((await db.calendarEvents.toArray()).every((e) => e.source === 'example.org')).toBe(true)
  })
})
