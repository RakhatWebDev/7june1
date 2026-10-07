import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __setExercisesForTests } from '../../data/exercises'
import { db } from '../../db'
import type { Exercise } from '../../db/types'
import { DEFAULT_PROFILE } from '../../db/seed'
import { today, weekDates } from '../../lib/dates'
import { cardioRoutes } from './routes'
import { stretchRoutines } from './stretchRoutines'

function renderAt(path: string) {
  const router = createMemoryRouter(cardioRoutes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(async () => {
  await Promise.all([db.activities.clear(), db.weights.clear(), db.profile.clear()])
  await db.profile.put({ ...DEFAULT_PROFILE, weightKg: 80 })
})

describe('NewActivityPage', () => {
  it('preselects the type, estimates kcal from the latest weight, shows pace and saves', async () => {
    await db.weights.bulkAdd([
      { id: 'w1', date: '2026-01-01', weightKg: 90 },
      { id: 'w2', date: '2026-02-01', weightKg: 85 },
    ])
    const router = renderAt('/cardio/new?type=run')
    expect(screen.getByRole('button', { name: /Бег/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/^Дата/)).toHaveValue(today())

    fireEvent.change(screen.getByLabelText(/^Длительность/), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText(/^Дистанция, км/), { target: { value: '5' } })
    // 9.8 × 85 × 0.5 = 416.5 → 417
    await waitFor(() => expect(screen.getByLabelText(/^Ккал/)).toHaveValue(417))
    expect(screen.getByTestId('pace')).toHaveTextContent('6:00 мин/км')

    fireEvent.change(screen.getByLabelText(/^Средний пульс/), { target: { value: '150' } })
    fireEvent.change(screen.getByLabelText(/^Заметка/), { target: { value: 'Лёгкая' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/cardio'))
    const all = await db.activities.toArray()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      type: 'run',
      date: today(),
      durationMin: 30,
      distanceKm: 5,
      avgHr: 150,
      kcal: 417,
      notes: 'Лёгкая',
    })
  })

  it('uses profile weight, metres for swimming and keeps a manual kcal value', async () => {
    renderAt('/cardio/new?type=swim')
    fireEvent.change(screen.getByLabelText(/^Длительность/), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText(/^Дистанция, м/), { target: { value: '1000' } })
    // 8.0 × 80 × 1/3 = 213.3 → 213
    await waitFor(() => expect(screen.getByLabelText(/^Ккал/)).toHaveValue(213))
    expect(screen.getByTestId('pace')).toHaveTextContent('2:00 мин/100 м')
    fireEvent.change(screen.getByLabelText(/^Ккал/), { target: { value: '250' } })
    fireEvent.change(screen.getByLabelText(/^Длительность/), { target: { value: '25' } })
    expect(screen.getByLabelText(/^Ккал/)).toHaveValue(250)
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(async () => expect(await db.activities.count()).toBe(1))
    expect((await db.activities.toArray())[0]).toMatchObject({ type: 'swim', distanceKm: 1, kcal: 250, durationMin: 25 })
  })

  it('shows jumps instead of distance for jump rope', () => {
    renderAt('/cardio/new?type=rope')
    expect(screen.getByLabelText(/^Прыжков/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Дистанция/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Велосипед/ }))
    expect(screen.getByLabelText(/^Дистанция, км/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Прыжков/)).not.toBeInTheDocument()
  })

  it('requires a duration', async () => {
    renderAt('/cardio/new')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('длительность')
    expect(await db.activities.count()).toBe(0)
  })
})

describe('CardioPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('summarises the current week and deletes an activity', async () => {
    const [mon, tue] = weekDates()
    await db.activities.bulkAdd([
      { id: 'a1', type: 'run', date: mon, durationMin: 30, distanceKm: 5 },
      { id: 'a2', type: 'swim', date: tue, durationMin: 45, distanceKm: 1.5 },
      { id: 'a3', type: 'run', date: '2020-01-01', durationMin: 60, distanceKm: 10 },
    ])
    renderAt('/cardio')
    const week = screen.getByRole('region', { name: 'Эта неделя' })
    await waitFor(() => expect(within(week).getByText('75')).toBeInTheDocument())
    expect(within(week).getByText('6.5 км')).toBeInTheDocument()
    expect(within(week).getByText('2')).toBeInTheDocument()
    expect(within(week).getByText(/Бег: 1/)).toBeInTheDocument()
    expect(within(week).getByText(/Бассейн: 1/)).toBeInTheDocument()

    for (const label of ['Бег', 'Вело', 'Бассейн', 'Скакалка', 'Ходьба', 'Растяжка'])
      expect(screen.getByRole('link', { name: `Добавить: ${label}` })).toBeInTheDocument()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Удалить: Бег 01.01.2020' }))
    await waitFor(async () => expect(await db.activities.count()).toBe(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Удалить: Бег 01.01.2020' })).not.toBeInTheDocument())
  })

  it('shows an empty state', async () => {
    renderAt('/cardio')
    expect(await screen.findByText('Пока нет активностей')).toBeInTheDocument()
  })
})

describe('Stretching', () => {
  const routine = stretchRoutines.find((r) => r.id === 'after-legs')!
  const fakeLibrary: Exercise[] = stretchRoutines.flatMap((r) =>
    r.steps.map((s) => ({
      id: s.exerciseId,
      name: s.exerciseId.replace(/_/g, ' '),
      force: 'static' as const,
      level: 'beginner' as const,
      mechanic: null,
      equipment: null,
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: ['Hold the stretch.'],
      category: 'stretching' as const,
      images: [`${s.exerciseId}/0.jpg`, `${s.exerciseId}/1.jpg`],
    })),
  )

  beforeEach(() => __setExercisesForTests(fakeLibrary))
  afterEach(() => vi.useRealTimers())

  it('lists the three routines', () => {
    renderAt('/cardio/stretch')
    for (const r of stretchRoutines) expect(screen.getByRole('link', { name: `Начать: ${r.name}` })).toBeInTheDocument()
  })

  it('runs the timer per side, advances with «Далее» and saves a stretch activity', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    renderAt(`/cardio/stretch/${routine.id}`)
    expect(screen.getByTestId('stretch-progress')).toHaveTextContent(`1/${routine.steps.length}`)
    expect(screen.getByText(routine.steps[0].nameRu)).toBeInTheDocument()
    expect(await screen.findByAltText(/кадр 1/)).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:30')
    expect(screen.getByText('Первая сторона')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Таймер: Старт' }))
    act(() => vi.advanceTimersByTime(10_000))
    expect(screen.getByRole('timer')).toHaveTextContent('0:20')
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByText('Вторая сторона')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:30')
    act(() => vi.advanceTimersByTime(30_000))
    expect(screen.getByTestId('stretch-progress')).toHaveTextContent(`2/${routine.steps.length}`)
    expect(screen.getByText(routine.steps[1].nameRu)).toBeInTheDocument()

    // Pause stops the clock.
    fireEvent.click(screen.getByRole('button', { name: 'Таймер: Пауза' }))
    act(() => vi.advanceTimersByTime(10_000))
    expect(screen.getByRole('timer')).toHaveTextContent('0:30')

    for (let i = 0; i < 40 && !screen.queryByText('Комплекс завершён'); i++)
      fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
    expect(screen.getByText('Комплекс завершён')).toBeInTheDocument()

    vi.useRealTimers()
    await waitFor(async () => expect(await db.activities.count()).toBe(1))
    const [saved] = await db.activities.toArray()
    expect(saved).toMatchObject({ type: 'stretch', date: today(), durationMin: 1, notes: routine.name })
    expect(saved.exerciseIds).toEqual(routine.steps.map((s) => s.exerciseId))
    // 2.5 MET × 80 kg × 1/60 h ≈ 3 kcal
    expect(saved.kcal).toBe(3)
    expect(await screen.findByText(/Сохранено в активности: 1 мин/)).toBeInTheDocument()
  })

  it('does not save anything when finished right away', async () => {
    renderAt(`/cardio/stretch/${routine.id}`)
    fireEvent.click(screen.getByRole('button', { name: 'Завершить сейчас' }))
    expect(await screen.findByText(/активность не сохранена/)).toBeInTheDocument()
    expect(await db.activities.count()).toBe(0)
  })

  it('shows not found for an unknown routine', () => {
    renderAt('/cardio/stretch/nope')
    expect(screen.getByText('Комплекс не найден')).toBeInTheDocument()
  })
})
