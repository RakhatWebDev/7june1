import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { db } from '../../../db'
import { ensureSeeded } from '../../../db/seed'
import { weekdayProgram } from './fixtures'
import { clearDb, makeSession, renderRoute } from './helpers'

beforeEach(async () => {
  await clearDb()
  await ensureSeeded()
})
afterEach(() => vi.useRealTimers())

const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

const activate = (id: string) => db.settings.put({ key: 'activeProgramId', value: id })
const activateWeekdayProgram = async () => {
  await db.programs.put(weekdayProgram)
  await activate(weekdayProgram.id)
}

describe('ProgramsPage (/workouts)', () => {
  it('shows the next session of the DUP rotation with its program week', async () => {
    await activate('david-laid-dup')
    renderRoute('/workouts')
    expect(await screen.findByRole('heading', { name: 'Ноги 1 — сила' })).toBeInTheDocument()
    expect(screen.getByText(/Неделя 1 из 12 · тренировка 1 из 3/)).toBeInTheDocument()
    expect(screen.getAllByText(/David Laid — DUP/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/3 трен\./).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Начать тренировку' })).toHaveAttribute(
      'href',
      '/workouts/start/david-laid-dup/legs-1',
    )
  })

  it("shows today's day of a weekday program and a start link", async () => {
    await activateWeekdayProgram()
    at('2026-10-05T09:00:00') // Monday
    renderRoute('/workouts')
    expect(await screen.findByRole('heading', { name: 'Ноги 1 — сила' })).toBeInTheDocument()
    expect(screen.getByText(/Сегодня по плану · Понедельник/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Начать тренировку' })).toHaveAttribute(
      'href',
      '/workouts/start/custom-weekday/legs-1',
    )
  })

  it('shows the note and no start button on a rest day', async () => {
    await activateWeekdayProgram()
    at('2026-10-11T09:00:00') // Sunday
    renderRoute('/workouts')
    expect(await screen.findByText(/Прогулка 30–60 мин/)).toBeInTheDocument()
    expect(screen.getByText(/Воскресенье/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Начать тренировку' })).not.toBeInTheDocument()
  })

  it('offers to continue an active session', async () => {
    await db.sessions.add(makeSession({ id: 'act', name: 'Жим 1 — сила', finishedAt: undefined }))
    renderRoute('/workouts')
    expect(await screen.findByRole('link', { name: 'Продолжить тренировку' })).toHaveAttribute(
      'href',
      '/workouts/session/act',
    )
    expect(screen.queryByRole('link', { name: 'Начать тренировку' })).not.toBeInTheDocument()
  })
})

describe('ProgramDetailPage', () => {
  it('lists days with exercises linking to the library and start buttons except rest', async () => {
    renderRoute('/workouts/programs/david-laid-dup')
    expect(await screen.findByText('Жим 1 — сила')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Начать этот день' })).toHaveLength(6)
    const bench = screen.getByRole('link', { name: /Жим лёжа/ })
    expect(bench).toHaveAttribute('href', '/workouts/exercises/Barbell_Bench_Press_-_Medium_Grip')
    expect(bench).toHaveTextContent('4 × 4')
    expect(bench).toHaveTextContent('85% 1RM')
    expect(bench).toHaveTextContent('отдых 3:00')
  })
})
