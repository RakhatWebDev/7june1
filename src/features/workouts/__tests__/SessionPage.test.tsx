import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db } from '../../../db'
import { __setExercisesForTests } from '../../../data/exercises'
import { clearDb, makeExercise, makeSession, renderRoute, set } from './helpers'

const bench = makeExercise({
  id: 'Bench',
  name: 'Barbell Bench Press',
  instructions: ['Lie on the bench.', 'Unrack the bar.', 'Lower to chest.', 'Press up.'],
})

beforeEach(async () => {
  __setExercisesForTests([bench, makeExercise({ id: 'Pushups', name: 'Pushups' })])
  await clearDb()
  await db.sessions.bulkAdd([
    makeSession({
      id: 'prev',
      startedAt: '2026-10-01T10:00:00.000Z',
      finishedAt: '2026-10-01T11:00:00.000Z',
      exercises: [
        { exerciseId: 'Bench', name: 'Жим лёжа', targetSets: 3, targetReps: '5', sets: [set(80, 5), set(80, 5), set(80, 5)] },
      ],
    }),
    makeSession({
      id: 'cur',
      name: 'Жим 1 — сила',
      startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      finishedAt: undefined,
      exercises: [
        {
          exerciseId: 'Bench',
          name: 'Жим лёжа',
          targetSets: 3,
          targetReps: '5',
          restSec: 120,
          sets: [set(null, null, false), set(null, null, false), set(null, null, false)],
        },
      ],
    }),
  ])
})

describe('SessionPage', () => {
  it('shows plan, short instructions and last time; repeats last weight', async () => {
    renderRoute('/workouts/session/cur')
    expect((await screen.findByText('80 кг × 5, 5, 5')).closest('p')).toHaveTextContent('Прошлый раз: 80 кг × 5, 5, 5')
    expect(screen.getByText(/План: 3 × 5/)).toBeInTheDocument()
    expect(await screen.findByText('Unrack the bar.')).toBeInTheDocument()
    expect(screen.queryByText('Press up.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Показать всё (4)' }))
    expect(screen.getByText('Press up.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Повторить прошлый вес' }))
    await waitFor(() => expect(screen.getByLabelText('Вес, подход 3')).toHaveValue(80))
    const s = await db.sessions.get('cur')
    expect(s?.exercises[0].sets.map((x) => x.weightKg)).toEqual([80, 80, 80])
  })

  it('logs a set, starts the rest timer, adds/removes sets and finishes with a summary', async () => {
    renderRoute('/workouts/session/cur')
    await screen.findByLabelText('Вес, подход 1')
    // weight stepper step 2.5
    const weightRow = screen.getByLabelText('Вес, подход 1').parentElement!
    fireEvent.click(within(weightRow).getByRole('button', { name: 'Больше' }))
    expect(screen.getByLabelText('Вес, подход 1')).toHaveValue(2.5)
    fireEvent.change(screen.getByLabelText('Вес, подход 1'), { target: { value: '85' } })
    fireEvent.change(screen.getByLabelText('Повторы, подход 1'), { target: { value: '5' } })
    fireEvent.click(screen.getByLabelText('Готово, подход 1'))
    expect(await screen.findByRole('timer')).toHaveTextContent('2:00')
    await waitFor(async () =>
      expect((await db.sessions.get('cur'))?.exercises[0].sets[0]).toMatchObject({ weightKg: 85, reps: 5, done: true }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Подход' }))
    expect(await screen.findByLabelText('Вес, подход 4')).toHaveValue(null)
    fireEvent.click(screen.getByRole('button', { name: 'Удалить подход 4' }))
    await waitFor(() => expect(screen.queryByLabelText('Вес, подход 4')).not.toBeInTheDocument())

    fireEvent.click(screen.getAllByRole('button', { name: /^Завершить/ })[0])
    const confirm = await screen.findByRole('dialog', { name: 'Завершить тренировку?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Завершить' }))
    const summary = await screen.findByRole('dialog', { name: /Тренировка завершена/ })
    expect(within(summary).getByText('425 кг')).toBeInTheDocument()
    expect(within(summary).getByText('1')).toBeInTheDocument()
    expect(within(summary).getByText(/Жим лёжа/).closest('li')).toHaveTextContent('вес 85 кг (было 80)')
    expect(within(summary).getByRole('link', { name: 'К истории' })).toHaveAttribute('href', '/workouts/history')
    expect((await db.sessions.get('cur'))?.finishedAt).toBeTruthy()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('adds an exercise from the library and removes one with confirmation', async () => {
    renderRoute('/workouts/session/cur')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить упражнение' }))
    const sheet = await screen.findByRole('dialog', { name: 'Добавить упражнение' })
    fireEvent.change(within(sheet).getByLabelText('Поиск упражнения'), { target: { value: 'PUSH' } })
    fireEvent.click(within(sheet).getByRole('button', { name: /Pushups/ }))
    expect(await screen.findByRole('heading', { name: 'Pushups' })).toBeInTheDocument()
    await waitFor(async () => expect((await db.sessions.get('cur'))?.exercises).toHaveLength(2))

    fireEvent.click(screen.getAllByRole('button', { name: 'Удалить упражнение' })[0])
    const confirm = await screen.findByRole('dialog', { name: 'Удалить упражнение?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Удалить' }))
    await waitFor(async () => expect((await db.sessions.get('cur'))?.exercises.map((e) => e.exerciseId)).toEqual(['Pushups']))
  })

  it('shows technique media by default and opens the full technique sheet on tap', async () => {
    renderRoute('/workouts/session/cur')
    expect(await screen.findByAltText('Barbell Bench Press — кадр 1')).toBeInTheDocument()
    expect(screen.getByTestId('session-media')).toBeInTheDocument()
    expect(screen.queryByText('Press up.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Техника: Жим лёжа' }))
    const sheet = await screen.findByRole('dialog', { name: 'Жим лёжа' })
    expect(within(sheet).getByText('Press up.')).toBeInTheDocument()
    expect(within(sheet).getByAltText('Barbell Bench Press — кадр 1')).toBeInTheDocument()
  })

  it('hides media when the session.hideMedia setting is on, keeping a thumbnail', async () => {
    await db.settings.put({ key: 'session.hideMedia', value: true })
    renderRoute('/workouts/session/cur')
    const toggle = await screen.findByRole('button', { name: /Скрывать технику/, pressed: true })
    const thumb = await screen.findByRole('button', { name: 'Техника: Жим лёжа' })
    expect(within(thumb).getByRole('presentation', { hidden: true })).toHaveAttribute('src', expect.stringContaining('Bench/0.jpg'))
    expect(screen.queryByTestId('session-media')).not.toBeInTheDocument()
    expect(screen.queryByAltText('Barbell Bench Press — кадр 1')).not.toBeInTheDocument()
    fireEvent.click(thumb)
    expect(await screen.findByRole('dialog', { name: 'Жим лёжа' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))

    fireEvent.click(toggle)
    expect(await screen.findByTestId('session-media')).toBeInTheDocument()
    expect((await db.settings.get('session.hideMedia'))?.value).toBe(false)
  })

  it('opens a finished session in review mode with a summary', async () => {
    renderRoute('/workouts/session/prev')
    expect(await screen.findByText(/Режим просмотра/)).toBeInTheDocument()
    expect(screen.getByText(/^1\s200 кг$/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Завершить' })).not.toBeInTheDocument()
  })
})
