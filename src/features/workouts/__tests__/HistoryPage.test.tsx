import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db } from '../../../db'
import { clearDb, makeSession, renderRoute, set } from './helpers'

beforeEach(async () => {
  await clearDb()
  await db.sessions.bulkAdd([
    makeSession({
      id: 'a',
      name: 'Ноги 1 — сила',
      startedAt: '2026-10-05T10:00:00.000Z',
      finishedAt: '2026-10-05T11:15:00.000Z',
      exercises: [{ exerciseId: 'sq', name: 'Присед', targetSets: 2, targetReps: '5', sets: [set(100, 5), set(100, 5)] }],
    }),
    makeSession({
      id: 'b',
      name: 'Жим 1 — сила',
      startedAt: '2026-10-06T10:00:00.000Z',
      finishedAt: '2026-10-06T10:45:00.000Z',
      exercises: [{ exerciseId: 'bp', name: 'Жим', targetSets: 1, targetReps: '5', sets: [set(80, 5), set(80, 5, false)] }],
    }),
  ])
})

describe('HistoryPage', () => {
  it('lists sessions newest first with duration, volume and set count', async () => {
    renderRoute('/workouts/history')
    const links = await screen.findAllByRole('link', { name: /сила/ })
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/workouts/session/b', '/workouts/session/a'])
    expect(links[0]).toHaveTextContent('45 мин · 400 кг · 1 подход')
    expect(links[1]).toHaveTextContent(/1 ч 15 мин · 1\s000 кг · 2 подхода/)
  })

  it('deletes a session after confirmation', async () => {
    renderRoute('/workouts/history')
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить тренировку Жим 1 — сила' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить тренировку?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(await db.sessions.count()).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Удалить тренировку Жим 1 — сила' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(screen.queryByText('Жим 1 — сила')).not.toBeInTheDocument())
    expect(await db.sessions.count()).toBe(1)
  })
})
