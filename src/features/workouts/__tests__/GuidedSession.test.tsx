import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db } from '../../../db'
import { __setExercisesForTests } from '../../../data/exercises'
import { clearDb, makeExercise, makeSession, renderRoute, set } from './helpers'

beforeEach(async () => {
  __setExercisesForTests([
    makeExercise({ id: 'Bench', name: 'Barbell Bench Press' }),
    makeExercise({ id: 'Row', name: 'Bent Over Barbell Row', primaryMuscles: ['middle back'], force: 'pull' }),
    makeExercise({ id: 'Curl', name: 'Barbell Curl', primaryMuscles: ['biceps'], force: 'pull' }),
  ])
  await clearDb()
  await db.sessions.bulkAdd([
    makeSession({
      id: 'prev',
      startedAt: '2026-10-01T10:00:00.000Z',
      finishedAt: '2026-10-01T11:00:00.000Z',
      exercises: [{ exerciseId: 'Row', name: 'Тяга', targetSets: 1, targetReps: '8-12', sets: [set(60, 10)] }],
    }),
    makeSession({
      id: 'cur',
      name: 'Жим 1',
      startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      finishedAt: undefined,
      exercises: [
        {
          exerciseId: 'Bench',
          name: 'Жим лёжа',
          targetSets: 2,
          targetReps: '5',
          restSec: 120,
          targets: [
            { reps: '5', weightKg: 80 },
            { reps: '3-5', weightKg: 85 },
          ],
          sets: [set(null, null, false), set(null, null, false)],
        },
        { exerciseId: 'Row', name: 'Тяга', targetSets: 1, targetReps: '8-12', sets: [set(null, null, false)] },
      ],
    }),
  ])
})

const heading = (name: string) => screen.queryByRole('heading', { name })
const current = () => db.sessions.get('cur')

describe('guided session', () => {
  it('shows only the current exercise with progress, actions and a big finish-set button', async () => {
    renderRoute('/workouts/session/cur')
    expect(await screen.findByRole('heading', { name: 'Жим лёжа' })).toBeInTheDocument()
    expect(heading('Тяга')).not.toBeInTheDocument()
    expect(screen.getByTestId('guided-position')).toHaveTextContent('Упражнение 1 из 2')
    expect(screen.getByRole('button', { name: /^Упражнение 1: Жим лёжа/ })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: 'Заменить: Жим лёжа' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Удалить: Жим лёжа' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Подробнее: Жим лёжа' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Завершить подход 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Добавить упражнение' })).toBeInTheDocument()
    // the next set to do is highlighted
    expect(screen.getByLabelText('Вес, подход 1').closest('li')).toHaveAttribute('aria-current', 'step')
  })

  it('finishes sets one by one with rest, then advances to the next exercise and the finish card', async () => {
    renderRoute('/workouts/session/cur')
    fireEvent.click(await screen.findByRole('button', { name: 'Завершить подход 1' }))
    // prefilled from the set target
    await waitFor(async () =>
      expect((await current())?.exercises[0].sets[0]).toMatchObject({ weightKg: 80, reps: 5, done: true }),
    )
    const timer = await screen.findByRole('timer')
    expect(within(timer).getByTestId('big-rest-remaining')).toHaveTextContent('2:00')
    expect(timer).toHaveTextContent('следующий: подход 2 из 2')
    fireEvent.click(within(timer).getByRole('button', { name: 'Пропустить' }))
    await waitFor(() => expect(screen.queryByRole('timer')).not.toBeInTheDocument())

    fireEvent.click(await screen.findByRole('button', { name: 'Завершить подход 2' }))
    await waitFor(async () =>
      expect((await current())?.exercises[0].sets[1]).toMatchObject({ weightKg: 85, reps: 3, done: true }),
    )
    expect(await screen.findByText('Упражнение выполнено')).toBeInTheDocument()
    const rest = screen.getByRole('timer')
    expect(rest).toHaveTextContent('следующий: Тяга')
    // still on the completed exercise while resting
    expect(heading('Жим лёжа')).toBeInTheDocument()
    fireEvent.click(within(rest).getByRole('button', { name: 'Пропустить' }))

    expect(await screen.findByRole('heading', { name: 'Тяга' })).toBeInTheDocument()
    expect(heading('Жим лёжа')).not.toBeInTheDocument()
    expect(screen.getByTestId('guided-position')).toHaveTextContent('Упражнение 2 из 2')
    fireEvent.click(screen.getByRole('button', { name: 'Завершить подход 1' }))
    // no target weight → previous performance; reps from it as well
    await waitFor(async () =>
      expect((await current())?.exercises[1].sets[0]).toMatchObject({ weightKg: 60, reps: 10, done: true }),
    )
    const last = await screen.findByRole('timer')
    expect(last).toHaveTextContent('все упражнения выполнены')
    fireEvent.click(within(last).getByRole('button', { name: 'Пропустить' }))

    expect(await screen.findByRole('heading', { name: 'Все упражнения выполнены' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Завершить тренировку' }))
    expect(await screen.findByRole('dialog', { name: 'Завершить тренировку?' })).toBeInTheDocument()
  })

  it('jumps between exercises via the progress dots and chevrons', async () => {
    renderRoute('/workouts/session/cur')
    await screen.findByRole('heading', { name: 'Жим лёжа' })
    fireEvent.click(screen.getByRole('button', { name: /^Упражнение 2: Тяга/ }))
    expect(await screen.findByRole('heading', { name: 'Тяга' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Следующее упражнение' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущее упражнение' }))
    expect(await screen.findByRole('heading', { name: 'Жим лёжа' })).toBeInTheDocument()
  })

  it('removing the current exercise moves to the next one; replace opens alternatives', async () => {
    renderRoute('/workouts/session/cur')
    fireEvent.click(await screen.findByRole('button', { name: 'Заменить: Жим лёжа' }))
    expect(await screen.findByRole('dialog', { name: 'Альтернативы для Жим лёжа' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Удалить: Жим лёжа' }))
    const confirm = await screen.findByRole('dialog', { name: 'Удалить упражнение?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Удалить' }))
    expect(await screen.findByRole('heading', { name: 'Тяга' })).toBeInTheDocument()
    await waitFor(async () => expect((await current())?.exercises.map((e) => e.exerciseId)).toEqual(['Row']))
    expect(screen.getByTestId('guided-position')).toHaveTextContent('Упражнение 1 из 1')
  })

  it('toggles to the list view and persists the choice', async () => {
    renderRoute('/workouts/session/cur')
    await screen.findByRole('heading', { name: 'Жим лёжа' })
    expect(screen.getByRole('radio', { name: 'По шагам' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Список' }))
    expect(await screen.findByRole('heading', { name: 'Тяга' })).toBeInTheDocument()
    expect(heading('Жим лёжа')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Завершить подход/ })).not.toBeInTheDocument()
    await waitFor(async () => expect((await db.settings.get('session.viewMode'))?.value).toBe('list'))
    fireEvent.click(screen.getByRole('radio', { name: 'По шагам' }))
    await waitFor(() => expect(heading('Тяга')).not.toBeInTheDocument())
    expect((await db.settings.get('session.viewMode'))?.value).toBe('guided')
  })

  it('a finished session ignores the guided mode', async () => {
    await db.settings.put({ key: 'session.viewMode', value: 'guided' })
    renderRoute('/workouts/session/prev')
    expect(await screen.findByText(/Режим просмотра/)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'По шагам' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('guided-position')).not.toBeInTheDocument()
  })
})
