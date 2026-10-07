import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { progressRoutes } from './routes'

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function renderAt(path: string) {
  const router = createMemoryRouter(progressRoutes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />)
}

describe('ProgressPage', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('adds a weigh-in and lists it', async () => {
    const user = userEvent.setup()
    renderAt('/progress')
    expect(await screen.findByText('Нет записей веса')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Вес, кг'), '87.3')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(async () => expect(await db.weights.count()).toBe(1))
    expect((await db.weights.toArray())[0]).toMatchObject({ date: today(), weightKg: 87.3 })
    expect(await screen.findByRole('button', { name: /Удалить запись/ })).toBeInTheDocument()
  })

  it('saves measurements and shows the delta to the previous record', async () => {
    await db.measurements.put({ id: 'm0', date: '2026-01-01', waistCm: 85 })
    const user = userEvent.setup()
    renderAt('/progress/measurements')
    await user.type(await screen.findByLabelText('Талия'), '83.5')
    await user.click(screen.getByRole('button', { name: 'Сохранить замеры' }))
    expect(await screen.findByText('−1.5')).toBeInTheDocument()
    expect(await db.measurements.count()).toBe(2)
  })

  it('shows records and streak from sessions and activities', async () => {
    const now = new Date().toISOString()
    await db.sessions.put({
      id: 's1',
      name: 'Ноги',
      startedAt: now,
      finishedAt: now,
      exercises: [
        { exerciseId: 'Barbell_Squat', name: 'Присед', targetSets: 1, targetReps: '5', sets: [{ weightKg: 100, reps: 5, done: true }] },
      ],
    })
    renderAt('/progress/records')
    const item = (await screen.findByText('Присед')).closest('li')!
    expect(within(item).getByText('116.7 кг')).toBeInTheDocument()
    expect(within(item).getByText('100 кг × 5')).toBeInTheDocument()
  })

  it('renders the streak calendar', async () => {
    await db.activities.put({ id: 'a1', type: 'run', date: today(), durationMin: 20 })
    renderAt('/progress/streak')
    expect(await screen.findByText('сегодня ✓')).toBeInTheDocument()
    expect(screen.getAllByRole('gridcell')).toHaveLength(56)
    expect(screen.getAllByText('1 день').length).toBeGreaterThan(0)
  })

  it('shows an empty state for load without sessions', async () => {
    renderAt('/progress/load')
    expect(await screen.findByText('Тренировок за 12 недель нет')).toBeInTheDocument()
  })

  it('summarises weekly load when there are sessions', async () => {
    const now = new Date().toISOString()
    await db.sessions.put({
      id: 's1',
      name: 'Жим',
      startedAt: now,
      finishedAt: now,
      exercises: [
        { exerciseId: 'Bench', name: 'Жим', targetSets: 2, targetReps: '5', sets: [{ weightKg: 80, reps: 5, done: true }, { weightKg: 80, reps: 5, done: true }] },
      ],
    })
    renderAt('/progress/load')
    expect(await screen.findByText('800 кг')).toBeInTheDocument()
    expect(screen.getByText('Объём по неделям, кг')).toBeInTheDocument()
  })
})
