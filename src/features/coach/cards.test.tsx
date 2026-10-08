import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { CoachPage } from './CoachPage'
import { MorningBriefCard, SessionReviewCard, WeekNarrativeCard } from './cards'
import { NEXT_NOTES_KEY } from './tools'
import { at, localDate, profile, program, session, set } from './testUtils'

const NOW = localDate('2026-10-07', 17) // Wednesday, 17:00

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterAll(() => vi.useRealTimers())

async function fill() {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.profile.put(profile())
  await db.programs.put(program())
  await db.settings.put({ key: 'activeProgramId', value: 'p1' })
  await db.sessions.bulkPut([
    session('s1', '2026-09-28', [{ exerciseId: 'Barbell_Squat', name: 'Присед', targetReps: '5', sets: [set(95, 5), set(95, 5), set(95, 5)] }], { programId: 'p1', programDayId: 'legs', name: 'Ноги' }),
    session('s2', '2026-10-05', [
      { exerciseId: 'Barbell_Squat', name: 'Присед', targetReps: '5', sets: [set(100, 5), set(100, 5), set(100, 5)] },
      { exerciseId: 'Leg_Extensions', name: 'Разгибания ног', targetReps: '10-12', sets: [set(40, 9), set(40, 8), set(40, 10)] },
    ], { programId: 'p1', programDayId: 'legs', name: 'Ноги' }),
  ])
  await db.sleep.put({ id: 'n', date: '2026-10-07', bedtime: at('2026-10-07', 1), wakeTime: at('2026-10-07', 6), durationMin: 300, quality: 2 })
  await db.water.put({ id: 'w', date: '2026-10-07', ml: 600, createdAt: at('2026-10-07', 9) })
}

const renderIn = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('MorningBriefCard', () => {
  beforeEach(fill)

  it('shows up to three insights with actions and hides one for today', async () => {
    renderIn(<MorningBriefCard />)
    expect(await screen.findByRole('heading', { name: 'Бриф дня' })).toBeInTheDocument()
    const items = await screen.findAllByTestId('insight')
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(3)
    expect(items[0]).toHaveAttribute('data-rule', 'sleep_volume')
    expect(within(items[0]).getByRole('link', { name: /Начать тренировку/ })).toHaveAttribute('href', '/workouts/start/p1/push')
    expect(screen.getByRole('link', { name: /Все советы/ })).toHaveAttribute('href', '/coach')

    fireEvent.click(within(items[0]).getByRole('button', { name: 'Скрыть на сегодня' }))
    await waitFor(() => expect(screen.queryByText('Мало сна — урежь объём')).not.toBeInTheDocument())
    expect((await db.settings.get('coach.dismissed:2026-10-07'))?.value).toEqual(['sleep_volume:2026-10-07'])
  })
})

describe('CoachPage', () => {
  beforeEach(fill)

  it('groups insights by category, explains them and lets the user switch rules off', async () => {
    renderIn(<CoachPage />)
    expect(await screen.findByRole('link', { name: /Поговорить с ИИ-тренером/ })).toHaveAttribute('href', '/assistant')
    const progression = await screen.findByText('Прибавь вес: 1 упражнение')
    const card = progression.closest('article') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /Почему/ }))
    expect(await within(card).findByText(/Присед: 100×5, 100×5, 100×5/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Питание/ }))
    await waitFor(() => expect(screen.queryByText('Прибавь вес: 1 упражнение')).not.toBeInTheDocument())
    expect(screen.getByText('Выпей 500 мл воды')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Вода' }))
    await waitFor(() => expect(screen.queryByText('Выпей 500 мл воды')).not.toBeInTheDocument())
    expect((await db.settings.get('coach.rules'))?.value).toEqual({ water: false })
  })
})

describe('SessionReviewCard', () => {
  beforeEach(fill)

  it('compares with the previous session and saves next-time hints', async () => {
    renderIn(<SessionReviewCard sessionId="s2" />)
    const rows = await screen.findAllByTestId('review-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Рекорд')).toBeInTheDocument()
    expect(within(rows[0]).getByText('100 → 105 кг')).toBeInTheDocument()
    expect(within(rows[0]).getByText('+5 %')).toBeInTheDocument()
    expect(within(rows[1]).getByText('40 кг, +повторы')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить подсказки' }))
    expect(await screen.findByRole('button', { name: 'Подсказки сохранены' })).toBeDisabled()
    const notes = (await db.settings.get(NEXT_NOTES_KEY))?.value as Record<string, { note: string }>
    expect(notes.Barbell_Squat.note).toBe('↑ +5 кг: все подходы выполнены → 105 кг')
    expect(notes.Leg_Extensions.note).toMatch(/^= повтори вес 40 кг/)
  })
})

describe('WeekNarrativeCard', () => {
  beforeEach(fill)

  it('renders a short rule-based summary of the week', async () => {
    renderIn(<WeekNarrativeCard weekStart="2026-10-05" />)
    const box = await screen.findByTestId('week-narrative')
    expect(box.querySelectorAll('p').length).toBeGreaterThanOrEqual(1)
    expect(box).toHaveTextContent(/1 тренировка/)
    expect(box).toHaveTextContent(/До плана не хватило 2/)
  })
})
