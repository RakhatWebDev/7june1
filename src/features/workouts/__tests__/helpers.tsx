import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { db } from '../../../db'
import type { Exercise, SetLog, WorkoutSession } from '../../../db/types'
import { workoutsRoutes } from '../routes'

export function makeExercise(p: Partial<Exercise> & { id: string }): Exercise {
  return {
    name: p.id.replace(/_/g, ' '),
    force: 'push',
    level: 'beginner',
    mechanic: 'compound',
    equipment: 'barbell',
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    instructions: ['Step one.', 'Step two.', 'Step three.'],
    category: 'strength',
    images: [`${p.id}/0.jpg`, `${p.id}/1.jpg`],
    ...p,
  }
}

export const set = (weightKg: number | null, reps: number | null, done = true, extra: Partial<SetLog> = {}): SetLog => ({
  weightKg,
  reps,
  done,
  ...extra,
})

export function makeSession(p: Partial<WorkoutSession> & { id: string }): WorkoutSession {
  return {
    name: 'Тренировка',
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt: '2026-10-01T11:00:00.000Z',
    exercises: [],
    ...p,
  }
}

/** Renders the workouts routes in a memory router at `path`. */
export function renderRoute(path: string) {
  const router = createMemoryRouter([{ path: '/', children: workoutsRoutes }], { initialEntries: [path] })
  const utils = render(<RouterProvider router={router} />)
  return { router, ...utils }
}

export async function clearDb() {
  await Promise.all(db.tables.map((t) => t.clear()))
}
