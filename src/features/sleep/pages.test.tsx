import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { addDays } from 'date-fns'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { DEFAULT_PROFILE } from '../../db/seed'
import { toISODate } from '../../lib/dates'
import { sleepRoutes } from './routes'

function renderAt(path: string) {
  const router = createMemoryRouter(sleepRoutes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(async () => {
  await Promise.all([db.sleep.clear(), db.profile.clear()])
  await db.profile.put({ ...DEFAULT_PROFILE, sleepTargetMin: 480 })
})
afterEach(() => vi.restoreAllMocks())

describe('SleepNewPage', () => {
  it('computes duration across midnight and saves with the wake-up date', async () => {
    const router = renderAt('/sleep/new')
    expect(screen.getByTestId('sleep-duration')).toHaveTextContent('8 ч 00 мин')

    fireEvent.change(screen.getByLabelText(/^Отбой/), { target: { value: '2026-10-06T23:30' } })
    fireEvent.change(screen.getByLabelText(/^Подъём/), { target: { value: '2026-10-07T07:15' } })
    expect(screen.getByTestId('sleep-duration')).toHaveTextContent('7 ч 45 мин')

    const quality = screen.getByRole('group', { name: 'Качество сна' })
    fireEvent.click(within(quality).getByRole('button', { name: /^5/ }))
    expect(within(quality).getByRole('button', { name: /^5/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText(/^Заметка/), { target: { value: 'Без кофе' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sleep'))
    const [saved] = await db.sleep.toArray()
    expect(saved).toMatchObject({ date: '2026-10-07', durationMin: 465, quality: 5, notes: 'Без кофе' })
    expect(new Date(saved.bedtime).getTime()).toBe(new Date(2026, 9, 6, 23, 30).getTime())
    expect(new Date(saved.wakeTime).getTime()).toBe(new Date(2026, 9, 7, 7, 15).getTime())
  })

  it('rejects wake time before bedtime and sleeps of 16 h or more', async () => {
    renderAt('/sleep/new')
    fireEvent.change(screen.getByLabelText(/^Отбой/), { target: { value: '2026-10-07T08:00' } })
    fireEvent.change(screen.getByLabelText(/^Подъём/), { target: { value: '2026-10-07T07:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Подъём должен быть позже отбоя')

    fireEvent.change(screen.getByLabelText(/^Отбой/), { target: { value: '2026-10-06T12:00' } })
    fireEvent.change(screen.getByLabelText(/^Подъём/), { target: { value: '2026-10-07T05:00' } })
    expect(screen.getByRole('alert')).toHaveTextContent('меньше 16 часов')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await db.sleep.count()).toBe(0)
  })
})

describe('SleepPage', () => {
  it('shows last night, 7-day average, target and deletes an entry', async () => {
    const day = (offset: number) => toISODate(addDays(new Date(), -offset))
    const mk = (offset: number, durationMin: number) => {
      const wake = addDays(new Date(), -offset)
      wake.setHours(7, 0, 0, 0)
      const bed = new Date(wake.getTime() - durationMin * 60000)
      return { id: `s${offset}`, date: day(offset), bedtime: bed.toISOString(), wakeTime: wake.toISOString(), durationMin, quality: 4 as const }
    }
    await db.sleep.bulkAdd([mk(0, 420), mk(1, 480), mk(2, 540), mk(20, 300)])
    renderAt('/sleep')
    const summary = screen.getByRole('region', { name: 'Сводка' })
    await waitFor(() => expect(within(summary).getByText('7 ч 00 мин')).toBeInTheDocument())
    // (420 + 480 + 540) / 3 = 480 → also equals the 8 h target
    expect(within(summary).getAllByText('8 ч 00 мин')).toHaveLength(2)
    expect(within(summary).getByText(/Хорошо/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Сон за 14 дней, часы' })).toBeInTheDocument()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const [, m, d] = day(20).split('-')
    fireEvent.click(await screen.findByRole('button', { name: `Удалить сон ${d}.${m}` }))
    await waitFor(async () => expect(await db.sleep.count()).toBe(3))
  })

  it('shows an empty state with a link to the form', async () => {
    renderAt('/sleep')
    expect(await screen.findByText('Пока нет записей сна')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Записать сон' })).toHaveAttribute('href', '/sleep/new')
  })
})
