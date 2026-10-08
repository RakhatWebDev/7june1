import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { db } from '../../db'
import { ensureSeeded } from '../../db/seed'
import type { WorkoutSession } from '../../db/types'
import { weekdayProgram } from '../workouts/__tests__/fixtures'
import { today, weekdayIndex } from '../../lib/dates'
import { TodayPage } from './TodayPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  )
}

const session = (over: Partial<WorkoutSession>): WorkoutSession => ({
  id: 's1',
  programId: 'david-laid-dup',
  programDayId: 'legs-1',
  name: 'Ноги 1 — сила',
  startedAt: new Date().toISOString(),
  exercises: [
    {
      exerciseId: 'Barbell_Squat',
      name: 'Присед',
      targetSets: 2,
      targetReps: '5',
      sets: [
        { weightKg: 100, reps: 5, done: true },
        { weightKg: 100, reps: 5, done: false },
      ],
    },
  ],
  ...over,
})

describe('TodayPage', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('renders empty states with an empty database', async () => {
    renderPage()
    expect(await screen.findByText('Программа не выбрана.')).toBeInTheDocument()
    expect(screen.getByText('Нет записи за ночь')).toBeInTheDocument()
    expect(screen.getByText('Сегодня пока пусто')).toBeInTheDocument()
    expect(screen.getByText('Пока нет взвешиваний')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Записать' })).toHaveAttribute('href', '/sleep/new')
    expect(screen.getByRole('link', { name: 'Добавить кардио' })).toHaveAttribute('href', '/cardio/new')
    expect(screen.getByRole('link', { name: 'Дневник' })).toHaveAttribute('href', '/nutrition')
    expect(screen.getByRole('link', { name: 'профиль' })).toBeInTheDocument()
  })

  it('offers the next day of the default program (David Laid — Program 1) with its cycle week', async () => {
    await ensureSeeded(db)
    renderPage()
    expect(await screen.findByText('Ноги')).toBeInTheDocument()
    expect(screen.getByText('Неделя 1 из 12 · Ноги')).toBeInTheDocument()
    expect(screen.getByText('На этой неделе 0 из 3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Начать' })).toHaveAttribute(
      'href',
      '/workouts/start/david-laid-program-1/p1-legs',
    )
  })

  it('marks an extra session once the weekly target is met', async () => {
    await ensureSeeded(db)
    await db.settings.put({ key: 'training.targetPerWeek', value: 1 })
    await db.sessions.put(
      session({
        id: 'done-1',
        finishedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      }),
    )
    await db.settings.put({
      key: 'program.cycle:david-laid-program-1',
      value: { startDate: today(), week: 1, nextDayIndex: 2 },
    })
    renderPage()
    expect(await screen.findByText(/На этой неделе 1 из 1/)).toBeInTheDocument()
    expect(screen.getByText('Сверх плана')).toBeInTheDocument()
  })

  it('shows the program week and the next session of the DUP rotation', async () => {
    await ensureSeeded(db)
    await db.settings.put({ key: 'activeProgramId', value: 'david-laid-dup' })
    await db.settings.put({
      key: 'program.cycle:david-laid-dup',
      value: { startDate: today(), completedSessions: 4, nextDayIndex: 4 },
    })
    renderPage()
    expect(await screen.findByText('Неделя 2 из 12 · Жим 2 — гипертрофия')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Начать' })).toHaveAttribute(
      'href',
      '/workouts/start/david-laid-dup/push-2',
    )
  })

  it('offers the scheduled weekday of a weekday program', async () => {
    await ensureSeeded(db)
    await db.programs.put(weekdayProgram)
    await db.settings.put({ key: 'activeProgramId', value: weekdayProgram.id })
    renderPage()
    const day = weekdayProgram.days.find((d) => d.weekday === weekdayIndex())!
    expect(await screen.findByText(day.name)).toBeInTheDocument()
    if (day.type === 'rest') {
      expect(screen.queryByRole('link', { name: 'Начать' })).not.toBeInTheDocument()
    } else {
      expect(screen.getByRole('link', { name: 'Начать' })).toHaveAttribute(
        'href',
        `/workouts/start/${weekdayProgram.id}/${day.id}`,
      )
    }
    // Nutrition targets from computeTargets (default profile: 88 kg × 2 g protein)
    expect(screen.getByText(/\/ 176/)).toBeInTheDocument()
    expect(screen.getByText('88 кг')).toBeInTheDocument()
  })

  it('shows «Продолжить» for an active session', async () => {
    await ensureSeeded(db)
    await db.sessions.put(session({ id: 'active-1' }))
    renderPage()
    const link = await screen.findByRole('link', { name: 'Продолжить' })
    expect(link).toHaveAttribute('href', '/workouts/session/active-1')
    expect(screen.getByText(/подходов 1 из 2/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Начать' })).not.toBeInTheDocument()
  })

  it('shows «Выполнено» with volume when today’s session is finished', async () => {
    await ensureSeeded(db)
    await db.sessions.put(session({ id: 'done-1', finishedAt: new Date().toISOString() }))
    renderPage()
    expect(await screen.findByText('Выполнено')).toBeInTheDocument()
    expect(screen.getByText(/объём 500 кг/)).toBeInTheDocument()
  })

  it('shows filled sleep, activities and nutrition', async () => {
    await ensureSeeded(db)
    const d = today()
    await db.sleep.put({
      id: 'sl',
      date: d,
      bedtime: new Date().toISOString(),
      wakeTime: new Date().toISOString(),
      durationMin: 450,
      quality: 4,
    })
    await db.activities.put({ id: 'a1', type: 'run', date: d, durationMin: 30, distanceKm: 5 })
    await db.foodEntries.put({
      id: 'f1',
      date: d,
      meal: 'lunch',
      name: 'Рис',
      grams: 200,
      kcal: 700,
      proteinG: 40,
      carbsG: 100,
      fatG: 10,
      createdAt: new Date().toISOString(),
    })
    await db.water.put({ id: 'w1', date: d, ml: 500, createdAt: new Date().toISOString() })
    renderPage()
    expect(await screen.findByText('7 ч 30 мин')).toBeInTheDocument()
    expect(screen.getByText('Бег')).toBeInTheDocument()
    expect(screen.getByText(/30 мин · 5 км/)).toBeInTheDocument()
    expect(screen.getByText('700')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('saves a quick weigh-in from the sheet', async () => {
    await ensureSeeded(db)
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Добавить вес' }))
    await user.type(screen.getByLabelText('Вес, кг'), '86.4')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(async () => expect((await db.weights.toArray()).map((w) => w.weightKg)).toEqual([86.4]))
    expect(await screen.findByText('86.4 кг')).toBeInTheDocument()
    expect(screen.getByText(/до цели −4.4 кг/)).toBeInTheDocument()
  })
})
