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
  it('shows the next session of the rotation with its program week and weekly progress', async () => {
    renderRoute('/workouts')
    expect(await screen.findByText('Следующая тренировка')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Жим 1' })).toBeInTheDocument()
    expect(screen.getByText(/Неделя 1 из 12 · тренировка 1 из 3/)).toBeInTheDocument()
    expect(screen.getByTestId('weekly-progress')).toHaveTextContent('На этой неделе 0 из 3')
    expect(screen.getByRole('link', { name: 'Начать тренировку' })).toHaveAttribute(
      'href',
      '/workouts/start/david-laid-program-1/p1-push-1',
    )
  })
})

describe('ProgramDetailPage — cycle, maxes, frequency', () => {
  it('shows week targets in kg, the %-table and edits maxes', async () => {
    renderRoute('/workouts/programs/david-laid-program-1')
    expect(await screen.findByText('Мои максимумы')).toBeInTheDocument()
    expect(await screen.findByText('Неделя 1 из 12 · тренировка 1 из 3')).toBeInTheDocument()
    expect(screen.getByTestId('week-hint')).toHaveTextContent('Неделя программы = 3 тренировки')
    expect(screen.getByText('3 трен./нед. · 12 нед. · круг из 6 тренировок')).toBeInTheDocument()
    expect(screen.getByTestId('pct-table')).toHaveTextContent('10 → 60 %')
    // week 1 is expanded; open its legs session (Пт) to see the squat targets
    const week1 = screen.getByTestId('week-card-1')
    fireEvent.click(within(week1).getByRole('button', { name: /^Пт\s*Ноги/ }))
    const squat = within(week1).getAllByRole('link', { name: /^Присед/ })[0]
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
      expect(within(screen.getByTestId('week-card-1')).getAllByRole('link', { name: /^Присед/ })[0]).toHaveTextContent(
        '42,5 · 50 · 55 кг',
      ),
    )
  })

  it('shows the 12-week plan, switches the week manually, restarts and sets the weekly frequency', async () => {
    renderRoute('/workouts/programs/david-laid-program-1')
    const weeks = await screen.findByRole('radiogroup', { name: 'Неделя программы' })
    expect(within(weeks).getAllByRole('radio')).toHaveLength(12)
    expect(screen.getByTestId('blocks')).toHaveTextContent('Блок 1 · 10-8-6')
    expect(screen.getByTestId('blocks')).toHaveTextContent('Тест · новые максимумы')
    fireEvent.click(within(weeks).getByRole('radio', { name: 'Неделя 7: Блок 4 · MAX' }))
    await waitFor(() => expect(screen.getByText('Неделя 7 из 12 · тренировка 1 из 3')).toBeInTheDocument())
    expect(within(weeks).getByRole('radio', { name: /Неделя 7/ })).toHaveAttribute('aria-checked', 'true')
    const week7 = screen.getByTestId('week-card-7')
    expect(within(week7).getByRole('button', { expanded: true, name: /Неделя 7 · Блок 4 · MAX/ })).toBeInTheDocument()
    fireEvent.click(within(week7).getByRole('button', { name: /^Пт\s*Ноги/ }))
    expect(within(week7).getAllByRole('link', { name: /^Присед/ })[0]).toHaveTextContent('1 × 1')

    fireEvent.click(screen.getByRole('button', { name: 'Начать цикл заново' }))
    const confirm = await screen.findByRole('dialog', { name: 'Начать цикл заново?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Начать заново' }))
    await waitFor(() => expect(screen.getByText('Неделя 1 из 12 · тренировка 1 из 3')).toBeInTheDocument())

    const stepper = screen.getByLabelText('Тренировок в неделю').parentElement!
    fireEvent.click(within(stepper).getByRole('button', { name: 'Больше' }))
    await waitFor(async () => expect((await db.settings.get('training.targetPerWeek'))?.value).toBe(4))
  })

  it('marks the test week (week 9) and the end of the program', async () => {
    await db.settings.put({
      key: 'program.cycle:david-laid-program-1',
      value: { startDate: '2026-09-01', completedSessions: 25, nextDayIndex: 1 },
    })
    const { unmount } = renderRoute('/workouts/programs/david-laid-program-1')
    expect(await screen.findByTestId('test-week')).toHaveTextContent('Тестовая неделя')
    expect(screen.getByText('Неделя 9 из 12 (тест) · тренировка 2 из 3')).toBeInTheDocument()
    unmount()
    await db.settings.put({
      key: 'program.cycle:david-laid-program-1',
      value: { startDate: '2026-09-01', completedSessions: 36, nextDayIndex: 0 },
    })
    renderRoute('/workouts/programs/david-laid-program-1')
    expect(await screen.findByTestId('program-complete')).toHaveTextContent('неделя MAX')
    fireEvent.click(screen.getByRole('button', { name: 'Продлить ещё на 12 недель' }))
    await waitFor(async () =>
      expect((await db.settings.get('program.cycle:david-laid-program-1'))?.value).toMatchObject({
        completedSessions: 0,
        nextDayIndex: 0,
      }),
    )
    expect(((await db.settings.get('lifts.maxes'))?.value as Record<string, number> | undefined)?.Barbell_Squat).toBe(60)
  })

  it('shows the plan by weeks: 12 week cards with exactly 3 sessions each, the current one expanded', async () => {
    renderRoute('/workouts/programs/david-laid-program-1')
    const plan = await screen.findByRole('list', { name: 'План по неделям' })
    expect(within(plan).getAllByRole('listitem', { name: undefined }).length).toBeGreaterThanOrEqual(12)
    for (let w = 1; w <= 12; w++) expect(screen.getByTestId(`week-card-${w}`)).toBeInTheDocument()
    const week1 = screen.getByTestId('week-card-1')
    expect(within(week1).getByRole('button', { name: /Неделя 1 · Блок 1 · 10-8-6/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    const sessions = within(week1).getAllByTestId('week-session')
    expect(sessions).toHaveLength(3)
    expect(sessions.map((s) => s.querySelector('button')?.textContent)).toEqual([
      expect.stringMatching(/^Пн\s*Жим 1.*следующая/),
      expect.stringMatching(/^Ср\s*Тяга 1/),
      expect.stringMatching(/^Пт\s*Ноги/),
    ])
    // the next session is open with its start link; other weeks are collapsed
    expect(within(sessions[0]).getByRole('link', { name: 'Начать этот день' })).toHaveAttribute(
      'href',
      '/workouts/start/david-laid-program-1/p1-push-1',
    )
    const week2 = screen.getByTestId('week-card-2')
    expect(within(week2).queryAllByTestId('week-session')).toHaveLength(0)
    fireEvent.click(within(week2).getByRole('button', { name: /Неделя 2/ }))
    expect(within(week2).getAllByTestId('week-session').map((s) => s.querySelector('button')?.textContent)).toEqual([
      expect.stringMatching(/^Пн\s*Жим 2/),
      expect.stringMatching(/^Ср\s*Тяга 2/),
      expect.stringMatching(/^Пт\s*Ноги/),
    ])
    expect(screen.queryByText(/^День \d/)).not.toBeInTheDocument()
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
        programSession: 2,
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
    expect(await screen.findByText('Неделя 1 из 12 · тренировка 3 из 3')).toBeInTheDocument()
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
