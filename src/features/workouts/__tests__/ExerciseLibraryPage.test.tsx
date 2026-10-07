import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { __setExercisesForTests } from '../../../data/exercises'
import { db } from '../../../db'
import { clearDb, makeExercise, makeSession, renderRoute, set } from './helpers'

const fillers = Array.from({ length: 70 }, (_, i) =>
  makeExercise({ id: `Filler_${String(i).padStart(2, '0')}`, primaryMuscles: ['abdominals'], equipment: 'body only' }),
)
const library = [
  makeExercise({
    id: 'Barbell_Bench_Press_-_Medium_Grip',
    name: 'Barbell Bench Press - Medium Grip',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'shoulders'],
    level: 'intermediate',
    instructions: ['Lie back on a flat bench.', 'Lift the bar.', 'Lower it to the chest.'],
  }),
  makeExercise({ id: 'Dumbbell_Bench_Press', name: 'Dumbbell Bench Press', primaryMuscles: ['chest'], equipment: 'dumbbell' }),
  makeExercise({ id: 'Hammer_Curls', name: 'Hammer Curls', primaryMuscles: ['biceps'], equipment: 'dumbbell' }),
  makeExercise({
    id: 'Chest_Stretch',
    name: 'Chest Stretch',
    primaryMuscles: ['chest'],
    equipment: 'body only',
    category: 'stretching',
  }),
  ...fillers,
]

const names = () => screen.queryAllByTestId('exercise-name').map((n) => n.textContent)

beforeEach(() => __setExercisesForTests(library))

describe('ExerciseLibraryPage', () => {
  it('renders at most 60 cards with "show more"', async () => {
    renderRoute('/workouts/exercises')
    expect(await screen.findByText('Найдено: 74')).toBeInTheDocument()
    expect(names()).toHaveLength(60)
    fireEvent.click(screen.getByRole('button', { name: /Показать ещё/ }))
    expect(names()).toHaveLength(74)
    expect(screen.queryByRole('button', { name: /Показать ещё/ })).not.toBeInTheDocument()
  })

  it('filters by case-insensitive search and chips', async () => {
    renderRoute('/workouts/exercises')
    await screen.findByText('Найдено: 74')
    fireEvent.change(screen.getByLabelText('Поиск по названию'), { target: { value: 'bEnCh' } })
    expect(names()).toEqual(['Barbell Bench Press - Medium Grip', 'Dumbbell Bench Press'])

    fireEvent.click(within(screen.getByRole('group', { name: 'Оборудование' })).getByRole('button', { name: 'Гантели' }))
    expect(names()).toEqual(['Dumbbell Bench Press'])

    fireEvent.change(screen.getByLabelText('Поиск по названию'), { target: { value: '' } })
    expect(names()).toEqual(['Dumbbell Bench Press', 'Hammer Curls'])
    fireEvent.click(within(screen.getByRole('group', { name: 'Мышца' })).getByRole('button', { name: 'Бицепс' }))
    expect(names()).toEqual(['Hammer Curls'])

    // toggle filters off, filter by category
    fireEvent.click(within(screen.getByRole('group', { name: 'Мышца' })).getByRole('button', { name: 'Бицепс' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Оборудование' })).getByRole('button', { name: 'Гантели' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Категория' })).getByRole('button', { name: 'Растяжка' }))
    expect(names()).toEqual(['Chest Stretch'])
  })

  it('finds exercises by Russian program names', async () => {
    renderRoute('/workouts/exercises?q=жим лёжа')
    expect(await screen.findByText('Barbell Bench Press - Medium Grip')).toBeInTheDocument()
    expect(names()).toHaveLength(1)
  })
})

describe('ExerciseDetailPage', () => {
  beforeEach(async () => {
    await clearDb()
    await db.sessions.bulkAdd([
      makeSession({
        id: 's1',
        name: 'Жим 1',
        startedAt: '2026-10-01T10:00:00.000Z',
        exercises: [
          { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Жим лёжа', targetSets: 2, targetReps: '5', sets: [set(80, 5), set(90, 1)] },
        ],
      }),
      makeSession({
        id: 's2',
        name: 'Жим 2',
        startedAt: '2026-10-04T10:00:00.000Z',
        exercises: [
          { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Жим лёжа', targetSets: 1, targetReps: '10', sets: [set(70, 10)] },
        ],
      }),
    ])
  })

  it('shows media, steps, muscles, records and history', async () => {
    renderRoute('/workouts/exercises/Barbell_Bench_Press_-_Medium_Grip')
    expect(await screen.findByRole('heading', { name: 'Barbell Bench Press - Medium Grip' })).toBeInTheDocument()
    expect(screen.getAllByRole('img').length).toBe(2)
    expect(screen.getByText('Lower it to the chest.')).toBeInTheDocument()
    expect(screen.getByText('Трицепс, Плечи')).toBeInTheDocument()
    expect(screen.getByText('Средний')).toBeInTheDocument()
    expect(screen.getByText('Штанга')).toBeInTheDocument()
    expect(await screen.findByText('90 кг')).toBeInTheDocument()
    // best 1RM: 70 × (1 + 10/30) = 93.3
    expect(screen.getByText('93,3 кг')).toBeInTheDocument()
    const history = screen.getAllByRole('link', { name: /Жим \d/ })
    expect(history.map((l) => l.getAttribute('href'))).toEqual(['/workouts/session/s2', '/workouts/session/s1'])
    expect(history[1]).toHaveTextContent('80 кг × 5 · 90 кг × 1')
  })
})
