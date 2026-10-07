import type { ReactElement } from 'react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { db } from '../../db'
import type { LifeGoal, WorkoutSession } from '../../db/types'
import { today } from '../../lib/dates'
import type { GoalKeyResult } from './calc'
import { GoalsFocusCard, WeeklyReviewCard } from './cards'
import { goalsRoutes } from './routes'
import { GOALS_SEEDED_KEY, STARTER_GOAL_ID, starterGoal } from './seed'

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

function renderAt(path: string) {
  const router = createMemoryRouter(goalsRoutes, { initialEntries: [path] })
  return { router, ...render(<RouterProvider router={router} />) }
}

function renderEl(el: ReactElement) {
  const router = createMemoryRouter([{ path: '/', element: el }], { initialEntries: ['/'] })
  return render(<RouterProvider router={router} />)
}

const goal = (id: string, title: string, patch: Partial<LifeGoal> = {}): LifeGoal => ({
  id,
  area: 'body',
  title,
  status: 'active',
  keyResults: [],
  sort: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...patch,
})

const at = (date: string, hour = 18) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, hour).toISOString()
}
const workout = (id: string, date: string): WorkoutSession => ({
  id,
  name: 'Тренировка',
  startedAt: at(date),
  finishedAt: at(date, 19),
  exercises: [],
})

/** Clicks the "−"/"+" button of the Stepper whose input has the given label. */
async function step(user: ReturnType<typeof userEvent.setup>, label: string, dir: 'Меньше' | 'Больше', times = 1) {
  const input = await screen.findByLabelText(label)
  const box = input.parentElement as HTMLElement
  for (let i = 0; i < times; i++) await user.click(within(box).getByRole('button', { name: dir }))
}

describe('GoalsPage', () => {
  it('seeds the starter goal once and shows the balance wheel', async () => {
    const first = renderAt('/goals')
    expect(await screen.findByText('Эстетичное тело')).toBeInTheDocument()
    expect(screen.getByTestId('balance-wheel')).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Баланс по сферам' })
    expect(within(legend).getAllByRole('listitem')).toHaveLength(7)
    expect((await db.settings.get(GOALS_SEEDED_KEY))?.value).toBe(true)
    first.unmount()

    // Deleted by the user → not recreated.
    await db.lifeGoals.delete(STARTER_GOAL_ID)
    renderAt('/goals')
    expect(await screen.findByText('Нет активных целей')).toBeInTheDocument()
    expect(await db.lifeGoals.count()).toBe(0)
  })

  it('shows area progress on the wheel legend and filters finished goals', async () => {
    await db.lifeGoals.bulkPut([
      goal('g1', 'Сбросить вес', { keyResults: [{ id: 'k', title: 'Вес', start: 88, current: 85, target: 82 } as GoalKeyResult] }),
      goal('g2', 'Марафон', { status: 'done', sort: 1 }),
    ])
    const user = userEvent.setup()
    renderAt('/goals')
    expect(await screen.findByText('Сбросить вес')).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Баланс по сферам' })
    const body = within(legend).getByText('Тело').closest('li') as HTMLElement
    expect(within(body).getByText('50%')).toBeInTheDocument()
    expect(screen.queryByText('Марафон')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Завершённые' }))
    expect(await screen.findByText('Марафон')).toBeInTheDocument()
    expect(screen.queryByText('Сбросить вес')).not.toBeInTheDocument()
  })
})

describe('GoalFormPage', () => {
  it('creates a goal with a key result', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/goals/new')
    await user.click(await screen.findByRole('radio', { name: /Финансы/ }))
    await user.type(screen.getByLabelText('Название'), 'Финансовая подушка')
    await user.type(screen.getByLabelText('Название KR 1'), 'Накоплено')
    await user.type(screen.getByLabelText('Цель KR 1'), '600000')
    await user.type(screen.getByLabelText('Единица KR 1'), '₸')
    await user.click(screen.getByRole('button', { name: 'Создать цель' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/goals'))
    const goals = await db.lifeGoals.toArray()
    expect(goals).toHaveLength(1)
    expect(goals[0]).toMatchObject({ area: 'finance', title: 'Финансовая подушка', status: 'active' })
    expect(goals[0].keyResults).toEqual([
      expect.objectContaining({ title: 'Накоплено', start: 0, current: 0, target: 600000, unit: '₸' }),
    ])
  })

  it('fills the body example', async () => {
    const user = userEvent.setup()
    renderAt('/goals/new')
    await user.click(await screen.findByRole('button', { name: 'Заполнить пример' }))
    expect(screen.getByLabelText('Название')).toHaveValue('Вес 82 кг к 1 марта')
    expect(screen.getByLabelText('Старт KR 1')).toHaveValue(88)
    expect(screen.getByLabelText('Цель KR 1')).toHaveValue(82)
    expect(screen.getByLabelText('Название KR 3')).toHaveValue('Кардио в неделю')
  })

  it('edits KR progress and status, links habits, then deletes the goal', async () => {
    await db.lifeGoals.put(starterGoal())
    await db.habits.put({
      id: 'habit-steps',
      name: '10 000 шагов',
      icon: '👟',
      color: 'accent',
      frequency: 'daily',
      autoRule: null,
      sort: 0,
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const user = userEvent.setup()
    const { router } = renderAt(`/goals/${STARTER_GOAL_ID}`)
    expect(await screen.findByDisplayValue('Эстетичное тело')).toBeInTheDocument()
    await step(user, 'Текущее KR 1', 'Меньше', 6) // 88 → 85 (step 0.5 kg)
    expect(screen.getByText('50%')).toBeInTheDocument()
    await user.click(await screen.findByRole('checkbox', { name: /10 000 шагов/ }))
    await user.selectOptions(screen.getByLabelText('Статус'), 'done')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/goals'))

    const saved = await db.lifeGoals.get(STARTER_GOAL_ID)
    expect(saved?.keyResults[0]).toMatchObject({ current: 85, start: 88, target: 82 })
    expect(saved).toMatchObject({ status: 'done', completedAt: today() })
    expect(saved?.habitIds).toContain('habit-steps')

    await screen.findByText('Колесо баланса')
    await router.navigate(`/goals/${STARTER_GOAL_ID}`)
    await user.click(await screen.findByRole('button', { name: 'Удалить' }))
    await user.click(screen.getByRole('button', { name: 'Удалить навсегда' }))
    await waitFor(async () => expect(await db.lifeGoals.count()).toBe(0))
  })
})

describe('WeeklyReviewPage', () => {
  const W = '2026-09-28'

  it('walks the 3-step wizard, shows deltas, updates KRs and saves one review per week', async () => {
    await db.sessions.bulkPut([
      workout('s1', '2026-09-29'),
      workout('s2', '2026-10-01'),
      workout('p1', '2026-09-23'), // previous week
    ])
    await db.lifeGoals.put(starterGoal())
    const user = userEvent.setup()
    const { router, unmount } = renderAt(`/goals/review?week=${W}`)

    // Step 1 — numbers with deltas vs the previous week
    expect(await screen.findByText('Шаг 1 из 3 · Цифры недели')).toBeInTheDocument()
    const stat = await screen.findByTestId('stat-workouts')
    expect(within(stat).getByText('2')).toBeInTheDocument()
    expect(screen.getByTestId('delta-workouts')).toHaveTextContent('↑ +1')
    expect(screen.getByTestId('delta-workouts')).toHaveClass('text-accent')
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    // Step 2 — wins / improve / focus + rating
    await user.type(screen.getByLabelText('Победа 1'), 'Присед 100 кг')
    await user.type(screen.getByLabelText('Улучшить 1'), 'Ложиться раньше')
    await user.type(screen.getByLabelText('Фокус 1'), 'Сон 8 часов')
    await user.click(screen.getByRole('button', { name: 'Оценка 4' }))
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    // Step 3 — KR steppers
    await step(user, 'Вес: текущее', 'Меньше', 2) // 88 → 87
    await step(user, 'Тренировок в неделю: текущее', 'Больше', 2) // 0 → 2
    await user.click(screen.getByRole('button', { name: 'Сохранить обзор' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/goals/review/${W}`))
    expect(await screen.findByText('Присед 100 кг')).toBeInTheDocument()
    expect(screen.getByText('Сон 8 часов')).toBeInTheDocument()

    const reviews = await db.weeklyReviews.toArray()
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({
      weekStart: W,
      wins: ['Присед 100 кг'],
      improve: ['Ложиться раньше'],
      nextFocus: ['Сон 8 часов'],
      rating: 4,
    })
    expect(reviews[0].stats.workouts).toBe(2)
    const g = await db.lifeGoals.get(STARTER_GOAL_ID)
    expect(g?.keyResults.map((k) => k.current)).toEqual([87, 2, 0])
    unmount()

    // Re-opening the same week edits the existing review.
    renderAt(`/goals/review?week=${W}`)
    expect(await screen.findByText('Обзор сохранён — можно отредактировать')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    const win = screen.getByLabelText('Победа 1')
    expect(win).toHaveValue('Присед 100 кг')
    await user.clear(win)
    await user.type(win, 'Пять тренировок')
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить обзор' }))
    await waitFor(async () => expect((await db.weeklyReviews.toArray())[0].wins).toEqual(['Пять тренировок']))
    expect(await db.weeklyReviews.count()).toBe(1)
  })

  it('lists past reviews and opens one', async () => {
    await db.weeklyReviews.put({
      id: 'review-2026-09-21',
      weekStart: '2026-09-21',
      stats: { workouts: 3, spent: 1000 },
      wins: ['Новый рекорд'],
      improve: [],
      nextFocus: ['Кардио'],
      rating: 5,
      createdAt: '2026-09-27T20:00:00.000Z',
    })
    const user = userEvent.setup()
    renderAt(`/goals/review?week=${W}`)
    const list = await screen.findByRole('list', { name: 'Прошлые обзоры' })
    await user.click(within(list).getByRole('link', { name: /21\.09 – 27\.09/ }))
    expect(await screen.findByText('Новый рекорд')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Оценка 5 из 5' })).toBeInTheDocument()
    expect(await screen.findByTestId('delta-workouts')).toHaveTextContent('↑ +3')
  })

  it('shows a not-found state for a week without a review', async () => {
    renderAt('/goals/review/2026-09-14')
    expect(await screen.findByText('Обзор не найден')).toBeInTheDocument()
  })
})

describe('cards', () => {
  it('GoalsFocusCard shows up to three active goals', async () => {
    await db.lifeGoals.bulkPut([
      goal('a', 'Цель A', { sort: 0, keyResults: [{ id: 'k', title: 'Вес', current: 85, target: 82, start: 88, unit: 'кг' } as GoalKeyResult] }),
      goal('b', 'Цель B', { sort: 1 }),
      goal('c', 'Цель C', { sort: 2 }),
      goal('d', 'Цель D', { sort: 3 }),
      goal('e', 'Готово', { sort: 4, status: 'done' }),
    ])
    renderEl(<GoalsFocusCard />)
    expect(await screen.findByText('Цель A')).toBeInTheDocument()
    expect(screen.getByText('Цель C')).toBeInTheDocument()
    expect(screen.queryByText('Цель D')).not.toBeInTheDocument()
    expect(screen.queryByText('Готово')).not.toBeInTheDocument()
    expect(screen.getByText('ещё 1')).toBeInTheDocument()
    expect(screen.getByText('Вес: 85 → 82 кг')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('WeeklyReviewCard prompts on Sunday', async () => {
    renderEl(<WeeklyReviewCard now={new Date(2026, 9, 11, 10)} />)
    expect(await screen.findByText('Подвести итоги недели')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Начать' })).toHaveAttribute('href', '/goals/review?week=2026-10-05')
  })

  it('WeeklyReviewCard shows last week rating mid-week', async () => {
    await db.weeklyReviews.put({
      id: 'review-2026-09-28',
      weekStart: '2026-09-28',
      stats: {},
      wins: [],
      improve: [],
      nextFocus: ['Сон', 'Кардио'],
      rating: 4,
      createdAt: '2026-10-04T20:00:00.000Z',
    })
    renderEl(<WeeklyReviewCard now={new Date(2026, 9, 7, 10)} />)
    expect(await screen.findByText('Прошлая неделя')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Оценка 4 из 5' })).toBeInTheDocument()
    expect(screen.getByText('Сон · Кардио')).toBeInTheDocument()
  })

  it('WeeklyReviewCard nudges to fill a missing review mid-week', async () => {
    renderEl(<WeeklyReviewCard now={new Date(2026, 9, 7, 10)} />)
    expect(await screen.findByText('Обзор прошлой недели')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Заполнить' })).toHaveAttribute('href', '/goals/review?week=2026-09-28')
  })
})
