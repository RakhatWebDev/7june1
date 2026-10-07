import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { db } from '../../../db'
import { ensureSeeded } from '../../../db/seed'
import { __setExercisesForTests } from '../../../data/exercises'
import { clearDb, renderRoute } from './helpers'

beforeEach(async () => {
  __setExercisesForTests([])
  await clearDb()
  await ensureSeeded()
})

describe('StartSessionPage (/workouts/start/:programId/:dayId)', () => {
  it('creates a session and redirects to it; a second visit reuses the active session', async () => {
    const first = renderRoute('/workouts/start/david-laid-dup/legs-1')
    await waitFor(() => expect(first.router.state.location.pathname).toMatch(/^\/workouts\/session\/.+/))
    expect(await screen.findByRole('heading', { name: 'Ноги 1 — сила' })).toBeInTheDocument()
    const sessions = await db.sessions.toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].exercises).toHaveLength(6)
    first.unmount()

    const second = renderRoute('/workouts/start/david-laid-dup/push-1')
    await waitFor(() =>
      expect(second.router.state.location.pathname).toBe(`/workouts/session/${sessions[0].id}`),
    )
    expect(await db.sessions.count()).toBe(1)
  })

  it('shows an error for a rest day', async () => {
    renderRoute('/workouts/start/david-laid-dup/rest')
    expect(await screen.findByText('Не удалось начать тренировку')).toBeInTheDocument()
    expect(await db.sessions.count()).toBe(0)
  })
})
