import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db } from '../../../db'
import { __setExercisesForTests } from '../../../data/exercises'
import * as device from '../../../lib/device'
import { clearDb, makeExercise, makeSession, renderRoute, set } from './helpers'

vi.mock('../../../lib/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/device')>()
  return {
    ...actual,
    speak: vi.fn(() => true),
    cancelSpeech: vi.fn(),
    warmSpeech: vi.fn(),
    primeAudio: vi.fn(),
    audioReady: vi.fn(() => true),
    playTone: vi.fn(() => true),
    requestWakeLock: vi.fn(async () => ({ status: 'on' as const, release: () => {}, onRelease: () => {} })),
  }
})

const T0 = new Date('2026-10-26T10:00:00.000Z').getTime()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  vi.mocked(device.speak).mockClear()
  vi.mocked(device.playTone).mockClear()
  __setExercisesForTests([
    makeExercise({ id: 'Bench', name: 'Barbell Bench Press' }),
    makeExercise({ id: 'Row', name: 'Bent Over Barbell Row', primaryMuscles: ['middle back'], force: 'pull' }),
  ])
  await clearDb()
  await db.settings.put({ key: 'session.handsFree', value: 'voice' })
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
      startedAt: new Date(T0 - 5 * 60_000).toISOString(),
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
afterEach(() => vi.useRealTimers())

const current = () => db.sessions.get('cur')
const bench = () => screen.findByTestId('bench-view')
const tap = async () => fireEvent.click(within(await bench()).getByRole('button', { name: 'Подход сделан' }))
const later = (ms: number) => vi.setSystemTime(Date.now() + ms)

describe('bench view', () => {
  it('records the set by plan on a tap, speaks the next set, and keeps a single countdown', async () => {
    renderRoute('/workouts/session/cur')
    const view = await bench()
    expect(view).toHaveTextContent('Упражнение 1 из 2')
    expect(view).toHaveTextContent('Подход 1 из 2')
    expect(view).toHaveTextContent('80 × 5')
    expect(screen.queryByTestId('big-rest-timer')).not.toBeInTheDocument()

    await tap()
    await waitFor(async () =>
      expect((await current())?.exercises[0].sets[0]).toMatchObject({ weightKg: 80, reps: 5, done: true }),
    )
    expect(device.playTone).toHaveBeenCalledWith('confirm')
    expect(device.speak).toHaveBeenCalledWith('Отдых две минуты. Дальше: подход два, восемьдесят пять на три – пять.')
    expect(await screen.findByTestId('bench-rest')).toHaveTextContent('2:00')
    expect(screen.queryByTestId('big-rest-timer')).not.toBeInTheDocument()
  })

  it('ignores a tap in the first 5 s of a rest, then an early tap after the last set records the next exercise', async () => {
    renderRoute('/workouts/session/cur')
    await tap()
    await screen.findByTestId('bench-rest')
    await tap()
    expect((await current())?.exercises[0].sets[1].done).toBe(false)

    later(6_000)
    await tap()
    await waitFor(async () => expect((await current())?.exercises[0].sets[1]).toMatchObject({ weightKg: 85, reps: 3, done: true }))

    later(6_000)
    await tap()
    await waitFor(async () => expect((await current())?.exercises[1].sets[0]).toMatchObject({ weightKg: 60, reps: 10, done: true }))
    expect(await bench()).toHaveTextContent('Упражнение 2 из 2')
    expect(device.speak).toHaveBeenLastCalledWith('Все упражнения выполнены.')
  })

  it('after the final set a tap records nothing and «Завершить тренировку» opens the confirmation', async () => {
    await db.sessions.update('cur', {
      exercises: [
        { exerciseId: 'Row', name: 'Тяга', targetSets: 1, targetReps: '8-12', sets: [set(60, 10, true)] },
      ],
    })
    renderRoute('/workouts/session/cur')
    const view = await bench()
    await tap()
    expect(device.playTone).not.toHaveBeenCalledWith('confirm')
    fireEvent.click(within(view).getByRole('button', { name: 'Завершить тренировку' }))
    expect(await screen.findByRole('dialog', { name: 'Завершить тренировку?' })).toBeInTheDocument()
  })

  it('undo restores the set and returns to the set screen', async () => {
    renderRoute('/workouts/session/cur')
    await tap()
    await waitFor(async () => expect((await current())?.exercises[0].sets[0].done).toBe(true))
    fireEvent.click(within(await bench()).getByRole('button', { name: 'Отменить подход 1' }))
    await waitFor(async () =>
      expect((await current())?.exercises[0].sets[0]).toMatchObject({ weightKg: null, reps: null, done: false }),
    )
    expect(screen.queryByTestId('bench-rest')).not.toBeInTheDocument()
    expect(await bench()).toHaveTextContent('Подход 1 из 2')
    expect(device.cancelSpeech).toHaveBeenCalled()
  })

  it('corrects the just-finished set during the rest', async () => {
    renderRoute('/workouts/session/cur')
    await tap()
    await screen.findByTestId('bench-rest')
    fireEvent.click(within(await bench()).getByRole('button', { name: 'Минус повтор' }))
    fireEvent.click(within(await bench()).getByRole('button', { name: 'Плюс вес' }))
    await waitFor(async () => expect((await current())?.exercises[0].sets[0]).toMatchObject({ weightKg: 82.5, reps: 4 }))
  })

  it('restores a running rest after a reload', async () => {
    await db.sessions.update('cur', {
      exercises: [
        {
          exerciseId: 'Bench',
          name: 'Жим лёжа',
          targetSets: 2,
          targetReps: '5',
          restSec: 120,
          sets: [set(80, 5, true), set(null, null, false)],
        },
      ],
    })
    await db.settings.put({
      key: 'session.activeRest',
      value: { sessionId: 'cur', exIdx: 0, sec: 120, endsAt: T0 + 40_000 },
    })
    renderRoute('/workouts/session/cur')
    expect(await screen.findByTestId('bench-rest')).toHaveTextContent('0:40')
  })

  it('warns when the screen cannot be kept on', async () => {
    vi.mocked(device.requestWakeLock).mockResolvedValueOnce({ status: 'unsupported', release: () => {}, onRelease: () => {} })
    renderRoute('/workouts/session/cur')
    expect(await within(await bench()).findByText(/Экран может погаснуть/)).toBeInTheDocument()
  })

  it('«Карточка» shows the classic card, and the off mode is remembered', async () => {
    renderRoute('/workouts/session/cur')
    fireEvent.click(within(await bench()).getByRole('button', { name: 'Карточка' }))
    expect(await screen.findByRole('button', { name: 'Завершить подход 1' })).toBeInTheDocument()
    expect(screen.queryByTestId('bench-view')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Выкл' }))
    await waitFor(async () => expect((await db.settings.get('session.handsFree'))?.value).toBe('off'))
  })
})
