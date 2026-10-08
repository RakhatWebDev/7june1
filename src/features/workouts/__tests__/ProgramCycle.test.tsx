import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db } from '../../../db'
import { ensureSeeded } from '../../../db/seed'
import { __setExercisesForTests } from '../../../data/exercises'
import { clearDb, makeExercise, makeSession, renderRoute, set } from './helpers'

beforeEach(async () => {
  __setExercisesForTests([makeExercise({ id: 'Barbell_Squat', name: 'Barbell Squat' })])
  await clearDb()
  await ensureSeeded()
})

describe('Program 1 on /workouts', () => {
  it('shows the next day in the rotation with its cycle week and weekly progress', async () => {
    renderRoute('/workouts')
    expect(await screen.findByText('Следующая тренировка')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ноги' })).toBeInTheDocument()
    expect(screen.getByText(/Неделя 1 · день 1 из 5/)).toBeInTheDocument()
    expect(screen.getByTestId('weekly-progress')).toHaveTextContent('На этой неделе 0 из 3')
    expect(screen.getByRole('link', { name: 'Начать тренировку' })).toHaveAttribute(
      'href',
      '/workouts/start/david-laid-program-1/p1-legs',
    )
  })
})

describe('ProgramDetailPage — cycle, maxes, frequency', () => {
  it('shows week targets in kg, the %-table and edits maxes', async () => {
    renderRoute('/workouts/programs/david-laid-program-1')
    expect(await screen.findByText('Мои максимумы')).toBeInTheDocument()
    expect(await screen.findByText('Неделя 1 · день 1 из 5')).toBeInTheDocument()
    expect(screen.getByTestId('pct-table')).toHaveTextContent('10 → 60 %')
    const squat = screen.getAllByRole('link', { name: /^Присед/ })[0]
    expect(squat).toHaveTextContent('10-8-6')
    expect(squat).toHaveTextContent('35 · 42,5 · 47,5 кг')

    const input = screen.getByLabelText('Максимум: Присед')
    expect(input).toHaveValue(60)
    fireEvent.change(input, { target: { value: '70' } })
    fireEvent.blur(input)
    await waitFor(async () =>
      expect(((await db.settings.get('lifts.maxes'))?.value as Record<string, number> | undefined)?.Barbell_Squat).toBe(70),
    )
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: /^Присед/ })[0]).toHaveTextContent('42,5 · 50 · 55 кг'),
    )
  })

  it('switches the week manually, restarts the cycle and sets the weekly frequency', async () => {
    renderRoute('/workouts/programs/david-laid-program-1')
    const weeks = await screen.findByRole('radiogroup', { name: 'Неделя цикла' })
    fireEvent.click(within(weeks).getByRole('radio', { name: '4' }))
    await waitFor(() => expect(screen.getByText('Неделя 4 · день 1 из 5')).toBeInTheDocument())
    expect(screen.getAllByRole('link', { name: /^Присед/ })[0]).toHaveTextContent('1 × 1')

    fireEvent.click(screen.getByRole('button', { name: 'Начать цикл заново' }))
    const confirm = await screen.findByRole('dialog', { name: 'Начать цикл заново?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Начать заново' }))
    await waitFor(() => expect(screen.getByText('Неделя 1 · день 1 из 5')).toBeInTheDocument())

    const stepper = screen.getByLabelText('Тренировок в неделю').parentElement!
    fireEvent.click(within(stepper).getByRole('button', { name: 'Больше' }))
    await waitFor(async () => expect((await db.settings.get('training.targetPerWeek'))?.value).toBe(4))
  })

  it('suggests a test week after the 4th week', async () => {
    await db.settings.put({
      key: 'program.cycle:david-laid-program-1',
      value: { startDate: '2026-09-01', week: 4, nextDayIndex: 0 },
    })
    renderRoute('/workouts/programs/david-laid-program-1')
    expect(await screen.findByTestId('test-week')).toHaveTextContent('Тестовая неделя')
  })
})

describe('Session targets and max prompt', () => {
  it('fills a set from its target with one tap and shows the auto-regulation hint', async () => {
    await db.sessions.add(
      makeSession({
        id: 'cur',
        name: 'Ноги',
        finishedAt: undefined,
        startedAt: new Date().toISOString(),
        programId: 'david-laid-program-1',
        programDayId: 'p1-legs',
        programWeek: 0,
        exercises: [
          {
            exerciseId: 'Barbell_Squat',
            name: 'Присед',
            targetSets: 3,
            targetReps: '10-8-6',
            hint: '↑ Тренировочный макс. 62,5 кг (было 60): в прошлый раз 9 × 47,5 с запасом → цели выросли',
            targets: [
              { reps: '10', pct: 0.6, weightKg: 37.5 },
              { reps: '8', pct: 0.7, weightKg: 45 },
              { reps: '6', pct: 0.8, weightKg: 50 },
            ],
            sets: [set(null, null, false), set(null, null, false), set(null, null, false)],
          },
        ],
      }),
    )
    renderRoute('/workouts/session/cur')
    expect(await screen.findByText('цель 8 × 45 кг')).toBeInTheDocument()
    expect(await screen.findByText('Неделя 1 · день 1 из 5')).toBeInTheDocument()
    expect(screen.getByTestId('exercise-hint')).toHaveTextContent('Тренировочный макс. 62,5 кг')
    expect(screen.getByTestId('exercise-hint')).toHaveClass('text-accent')
    fireEvent.click(screen.getByRole('button', { name: 'Взять цель, подход 2' }))
    await waitFor(() => expect(screen.getByLabelText('Вес, подход 2')).toHaveValue(45))
    expect(screen.getByLabelText('Повторы, подход 2')).toHaveValue(8)
    await waitFor(async () =>
      expect((await db.sessions.get('cur'))?.exercises[0].sets[1]).toMatchObject({
        weightKg: 45,
        reps: 8,
        done: false,
      }),
    )
  })

  it('offers to save a new max after a MAX set and shows next-time weights', async () => {
    await db.sessions.add(
      makeSession({
        id: 'max',
        name: 'Ноги',
        finishedAt: undefined,
        startedAt: new Date().toISOString(),
        programId: 'david-laid-program-1',
        programDayId: 'p1-legs',
        programWeek: 3,
        exercises: [
          {
            exerciseId: 'Barbell_Squat',
            name: 'Присед',
            targetSets: 1,
            targetReps: '1',
            targets: [{ reps: '1', pct: 1, weightKg: 60 }],
            sets: [set(65, 1)],
          },
        ],
      }),
    )
    renderRoute('/workouts/session/max')
    fireEvent.click((await screen.findAllByRole('button', { name: /^Завершить/ }))[0])
    const confirm = await screen.findByRole('dialog', { name: 'Завершить тренировку?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Завершить' }))
    const summary = await screen.findByRole('dialog', { name: /Тренировка завершена/ })
    const prompt = await within(summary).findByTestId('max-suggestion')
    expect(prompt).toHaveTextContent('Новый максимум: присед 65 кг — сохранить?')
    expect(within(summary).getByTestId('next-time')).toHaveTextContent('Следующий раз: присед 62,5 кг (↑)')
    fireEvent.click(within(prompt).getByRole('button', { name: 'Сохранить' }))
    await waitFor(async () =>
      expect(((await db.settings.get('lifts.maxes'))?.value as Record<string, number> | undefined)?.Barbell_Squat).toBe(65),
    )
    expect(((await db.settings.get('lifts.trainingMaxes'))?.value as Record<string, number> | undefined)?.Barbell_Squat).toBe(65)
    await waitFor(() => expect(within(summary).queryByTestId('max-suggestion')).not.toBeInTheDocument())
  })
})
