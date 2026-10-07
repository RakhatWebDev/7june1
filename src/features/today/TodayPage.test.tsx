import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { db } from '../../db'
import { ensureSeeded } from '../../db/seed'
import type { WorkoutSession } from '../../db/types'
import { davidLaidDup } from '../../data/programs/davidLaidDup'
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
    expect(screen.getByText('Прошлая ночь не записана.')).toBeInTheDocument()
    expect(screen.getByText('Сегодня активностей пока нет.')).toBeInTheDocument()
    expect(screen.getByText('Взвешиваний пока нет.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Записать' })).toHaveAttribute('href', '/sleep/new')
    expect(screen.getByRole('link', { name: '+ Кардио' })).toHaveAttribute('href', '/cardio/new')
    expect(screen.getByRole('link', { name: 'Дневник →' })).toHaveAttribute('href', '/nutrition')
    expect(screen.getByRole('link', { name: 'профиль' })).toBeInTheDocument()
  })

  it('offers the scheduled day of the built-in program after seeding', async () => {
    await ensureSeeded(db)
    renderPage()
    const day = davidLaidDup.days.find((d) => d.weekday === weekdayIndex())!
    expect(await screen.findByText(day.name)).toBeInTheDocument()
    if (day.type === 'rest') {
      expect(screen.queryByRole('link', { name: 'Начать' })).not.toBeInTheDocument()
    } else {
      expect(screen.getByRole('link', { name: 'Начать' })).toHaveAttribute(
        'href',
        `/workouts/start/david-laid-dup/${day.id}`,
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

  it('shows «Выполнено ✓» with volume when today’s session is finished', async () => {
    await ensureSeeded(db)
    await db.sessions.put(session({ id: 'done-1', finishedAt: new Date().toISOString() }))
    renderPage()
    expect(await screen.findByText('Выполнено ✓')).toBeInTheDocument()
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
    await user.click(await screen.findByRole('button', { name: '+ Вес' }))
    await user.type(screen.getByLabelText('Вес, кг'), '86.4')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(async () => expect((await db.weights.toArray()).map((w) => w.weightKg)).toEqual([86.4]))
    expect(await screen.findByText('86.4 кг')).toBeInTheDocument()
    expect(screen.getByText(/до цели −4.4 кг/)).toBeInTheDocument()
  })
})
