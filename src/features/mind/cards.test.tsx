import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { defaultSlot, moodEntryId } from './calc'
import { MindTodayCard, MoodCheckinCard } from './cards'

beforeEach(async () => {
  await Promise.all([db.moods.clear(), db.mindSessions.clear()])
})

describe('MoodCheckinCard', () => {
  it('saves a quick check-in for the current slot and then shows a compact summary', async () => {
    render(
      <MemoryRouter>
        <MoodCheckinCard />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Настроение: Хорошо' }))
    const slot = defaultSlot()
    expect(await screen.findByTestId(`mood-summary-${slot}`)).toHaveTextContent('Хорошо')
    expect(screen.queryByRole('button', { name: 'Настроение: Хорошо' })).not.toBeInTheDocument()
    expect(await db.moods.get(moodEntryId(today(), slot))).toMatchObject({ mood: 4, slot, date: today() })
  })
})

describe('MindTodayCard', () => {
  it('shows practice minutes for today and links to a 10-minute meditation', async () => {
    await db.mindSessions.bulkPut([
      { id: 'a', date: today(), kind: 'meditation', durationMin: 10, createdAt: '' },
      { id: 'b', date: today(), kind: 'breathing', durationMin: 4, createdAt: '' },
      { id: 'c', date: '2000-01-01', kind: 'meditation', durationMin: 30, createdAt: '' },
    ])
    render(
      <MemoryRouter>
        <MindTodayCard />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByTestId('mind-today-min')).toHaveTextContent('14'))
    expect(screen.getByRole('link', { name: /Медитация 10 мин/ })).toHaveAttribute('href', '/mind/meditate?min=10')
  })
})
