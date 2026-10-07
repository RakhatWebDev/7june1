import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { db } from '../../db'
import type { CalendarEvent } from '../../db/types'
import { UpcomingCard } from './UpcomingCard'

const HOUR = 3_600_000
const DAY = 24 * HOUR

function event(id: string, title: string, offsetMs: number, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  const start = Date.now() + offsetMs
  return {
    id,
    title,
    startAt: new Date(start).toISOString(),
    endAt: new Date(start + HOUR).toISOString(),
    allDay: false,
    source: 'basic.ics',
    kind: 'gym',
    importedAt: new Date().toISOString(),
    ...extra,
  }
}

function renderCard() {
  return render(
    <MemoryRouter>
      <UpcomingCard />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await db.calendarEvents.clear()
})

describe('UpcomingCard', () => {
  it('shows an import prompt with an empty database', async () => {
    renderCard()
    const link = await screen.findByRole('link', { name: 'Импортируйте календарь' })
    expect(link).toHaveAttribute('href', '/calendar')
  })

  it('lists upcoming events with location and a link to the calendar', async () => {
    await db.calendarEvents.bulkPut([
      event('a', 'OneFit: Fitness24 — Gym', 2 * DAY, { location: 'Fitness24' }),
      event('b', 'OneFit: Aqua Club — Бассейн', 3 * DAY, { kind: 'swim' }),
      event('past', 'Прошедшее', -2 * DAY),
      event('far', 'Через 10 дней', 10 * DAY),
    ])
    renderCard()
    expect(await screen.findByText('OneFit: Fitness24 — Gym')).toBeInTheDocument()
    expect(screen.getByText('OneFit: Aqua Club — Бассейн')).toBeInTheDocument()
    expect(screen.getByText(/Fitness24$/)).toBeInTheDocument()
    expect(screen.queryByText('Прошедшее')).not.toBeInTheDocument()
    expect(screen.queryByText('Через 10 дней')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Календарь/ })).toHaveAttribute('href', '/calendar')
  })

  it('shows at most 3 events', async () => {
    await db.calendarEvents.bulkPut([1, 2, 3, 4, 5].map((i) => event(`e${i}`, `Событие ${i}`, i * HOUR)))
    renderCard()
    expect(await screen.findByText('Событие 1')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText('Событие 4')).not.toBeInTheDocument()
  })
})
