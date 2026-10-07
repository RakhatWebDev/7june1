import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { moodEntryId, shiftDate } from './calc'
import { mindRoutes } from './routes'

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function renderAt(path: string) {
  const router = createMemoryRouter(mindRoutes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(async () => {
  await Promise.all([
    db.moods.clear(),
    db.journal.clear(),
    db.mindSessions.clear(),
    db.sessions.clear(),
    db.activities.clear(),
    db.foodEntries.clear(),
    db.water.clear(),
    db.habits.clear(),
    db.habitLogs.clear(),
  ])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CheckinPage', () => {
  it('saves one check-in per slot and edits it when opened again', async () => {
    const router = renderAt('/mind/checkin?slot=morning')
    const save = await screen.findByRole('button', { name: 'Сохранить' })
    expect(screen.getByText('Как вы сейчас?')).toBeInTheDocument()
    expect(save).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Настроение: Хорошо' }))
    fireEvent.click(screen.getByRole('button', { name: 'Энергия: 4 из 5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Стресс: 2 из 5' }))
    fireEvent.click(screen.getByRole('button', { name: 'зал' }))
    fireEvent.change(screen.getByLabelText('Свой тег'), { target: { value: '  Медитация ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }))
    fireEvent.change(screen.getByLabelText('Заметка'), { target: { value: 'Выспался' } })
    fireEvent.click(save)

    await waitFor(() => expect(router.state.location.pathname).toBe('/mind'))
    const all = await db.moods.toArray()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      id: moodEntryId(today(), 'morning'),
      date: today(),
      slot: 'morning',
      mood: 4,
      energy: 4,
      stress: 2,
      tags: ['зал', 'медитация'],
      note: 'Выспался',
    })
  })

  it('opening the same slot again edits the existing entry', async () => {
    await db.moods.put({ id: 'x1', date: today(), slot: 'evening', mood: 2, tags: ['работа'], createdAt: '2026-01-01T00:00:00Z' })
    renderAt('/mind/checkin?slot=evening')
    expect(await screen.findByText('Уже отмечено — можно изменить')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Настроение: Так себе' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Настроение: Отлично' }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    await waitFor(async () => expect((await db.moods.get('x1'))?.mood).toBe(5))
    expect(await db.moods.count()).toBe(1)
    expect((await db.moods.get('x1'))?.createdAt).toBe('2026-01-01T00:00:00Z')
  })
})

describe('MindPage', () => {
  it('shows today check-ins, gratitude streak and tag insights', async () => {
    const d = today()
    await db.moods.bulkPut([
      { id: 'a', date: d, slot: 'morning', mood: 5, tags: ['зал'], createdAt: '' },
      { id: 'b', date: shiftDate(d, -1), slot: 'morning', mood: 4, tags: ['зал'], createdAt: '' },
      { id: 'c', date: shiftDate(d, -2), slot: 'morning', mood: 3, tags: [], createdAt: '' },
      { id: 'e', date: shiftDate(d, -3), slot: 'morning', mood: 3, tags: ['работа'], createdAt: '' },
    ])
    await db.journal.bulkPut([
      { id: 'g1', date: d, kind: 'gratitude', items: ['чай'], createdAt: '' },
      { id: 'g2', date: shiftDate(d, -1), kind: 'gratitude', items: ['друзья'], createdAt: '' },
    ])
    await db.mindSessions.put({ id: 's', date: d, kind: 'meditation', durationMin: 12, createdAt: '' })
    renderAt('/mind')
    expect(await screen.findByText('С тегом «зал» настроение в среднем 4.5, без — 3.0', { exact: false })).toBeInTheDocument()
    expect(screen.getByTestId('gratitude-streak')).toHaveTextContent('2')
    expect(screen.getByText('12 мин', { selector: 'div' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Утро\s*Отлично/ })).toHaveAttribute('href', '/mind/checkin?slot=morning')
    expect(screen.getByRole('img', { name: 'Настроение и энергия за 30 дней' })).toBeInTheDocument()
  })
})

describe('Journal', () => {
  it('adds a gratitude entry that shows up in the feed', async () => {
    const router = renderAt('/mind/journal/new?kind=gratitude')
    expect(screen.getByText('3 вещи, за которые я благодарен сегодня')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Сохранить' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Благодарность 1'), { target: { value: 'Утренний кофе' } })
    fireEvent.change(screen.getByLabelText('Благодарность 3'), { target: { value: 'Звонок маме' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Ещё строка' }))
    expect(screen.getByLabelText('Благодарность 4')).toBeInTheDocument()
    fireEvent.click(save)

    await waitFor(() => expect(router.state.location.pathname).toBe('/mind/journal'))
    const feed = await screen.findByRole('list', { name: 'Записи дневника' })
    expect(within(feed).getByText('Утренний кофе · Звонок маме')).toBeInTheDocument()
    const [saved] = await db.journal.toArray()
    expect(saved).toMatchObject({ kind: 'gratitude', date: today(), items: ['Утренний кофе', 'Звонок маме'] })
  })

  it('creates a free entry with tags', async () => {
    renderAt('/mind/journal/new?kind=free')
    fireEvent.change(screen.getByLabelText('Запись'), { target: { value: 'Длинная мысль' } })
    fireEvent.change(screen.getByLabelText(/^Теги/), { target: { value: 'Идеи, работа' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(async () => expect(await db.journal.count()).toBe(1))
    expect((await db.journal.toArray())[0]).toMatchObject({ kind: 'free', text: 'Длинная мысль', tags: ['идеи', 'работа'] })
  })

  it('filters the feed by kind and searches by text', async () => {
    await db.journal.bulkPut([
      { id: 'j1', date: '2026-10-01', kind: 'gratitude', items: ['Солнечное утро'], createdAt: '1' },
      { id: 'j2', date: '2026-10-02', kind: 'free', text: 'Планы на отпуск', tags: ['мечты'], createdAt: '2' },
      { id: 'j3', date: '2026-10-03', kind: 'reflection', text: 'Утро было тяжёлым', createdAt: '3' },
    ])
    renderAt('/mind/journal')
    const feed = await screen.findByRole('list', { name: 'Записи дневника' })
    expect(within(feed).getAllByRole('link')).toHaveLength(3)

    fireEvent.change(screen.getByLabelText('Поиск по записям'), { target: { value: 'утро' } })
    expect(within(feed).getAllByRole('link')).toHaveLength(2)
    expect(within(feed).queryByText('Планы на отпуск')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Благодарность' }))
    expect(within(feed).getAllByRole('link')).toHaveLength(1)
    expect(within(feed).getByText('Солнечное утро')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Все' }))
    fireEvent.change(screen.getByLabelText('Поиск по записям'), { target: { value: 'мечты' } })
    expect(within(feed).getByText('Планы на отпуск')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Поиск по записям'), { target: { value: 'нет такого' } })
    expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument()
  })

  it('views, edits and deletes an entry', async () => {
    await db.journal.put({ id: 'j1', date: '2026-10-01', kind: 'reflection', text: 'Первая версия', createdAt: '1' })
    const router = renderAt('/mind/journal/j1')
    expect(await screen.findByText('Первая версия')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }))
    fireEvent.change(screen.getByLabelText('Размышление'), { target: { value: 'Вторая версия' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await screen.findByRole('button', { name: 'Изменить' })
    expect(screen.getByText('Вторая версия', { selector: 'p' })).toBeInTheDocument()
    expect((await db.journal.get('j1'))?.text).toBe('Вторая версия')

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/mind/journal'))
    expect(await db.journal.count()).toBe(0)
  })
})

describe('EveningReviewPage', () => {
  it('shows the automatic day summary and saves wins / improve / tomorrow once per day', async () => {
    const d = today()
    const now = new Date()
    now.setHours(12, 0, 0, 0)
    await db.sessions.put({ id: 's1', name: 'Push', startedAt: now.toISOString(), finishedAt: now.toISOString(), exercises: [] })
    await db.foodEntries.bulkPut([
      { id: 'f1', date: d, meal: 'lunch', name: 'Плов', grams: 300, kcal: 600, proteinG: 0, carbsG: 0, fatG: 0, createdAt: '' },
      { id: 'f2', date: d, meal: 'dinner', name: 'Салат', grams: 200, kcal: 250, proteinG: 0, carbsG: 0, fatG: 0, createdAt: '' },
    ])
    await db.water.put({ id: 'w1', date: d, ml: 750, createdAt: '' })
    const habit = { icon: '•', color: 'accent', frequency: 'daily' as const, autoRule: null, sort: 0, archived: false, createdAt: '' }
    await db.habits.bulkPut([
      { ...habit, id: 'h1', name: 'Чтение' },
      { ...habit, id: 'h2', name: 'Растяжка' },
    ])
    await db.habitLogs.put({ id: 'l1', habitId: 'h1', date: d, done: true })

    const router = renderAt('/mind/review')
    expect(await screen.findByTestId('summary-Тренировка')).toHaveTextContent('✓')
    expect(screen.getByTestId('summary-Ккал')).toHaveTextContent('850')
    expect(screen.getByTestId('summary-Вода')).toHaveTextContent('750 мл')
    expect(screen.getByTestId('summary-Привычки')).toHaveTextContent('1/2')

    fireEvent.change(screen.getByLabelText('Что получилось'), { target: { value: 'Тренировка' } })
    fireEvent.change(screen.getByLabelText('Что улучшить'), { target: { value: 'Лечь раньше' } })
    fireEvent.change(screen.getByLabelText('Главное на завтра'), { target: { value: 'Отчёт' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить обзор' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/mind/journal'))
    const [saved] = await db.journal.toArray()
    expect(saved).toMatchObject({ kind: 'evening_review', date: d, items: ['Тренировка', 'Лечь раньше', 'Отчёт'] })
  })

  it('edits the existing review of the day', async () => {
    await db.journal.put({ id: 'r1', date: today(), kind: 'evening_review', items: ['a', 'b', 'c'], createdAt: '' })
    renderAt('/mind/review')
    expect(await screen.findByDisplayValue('a')).toBeInTheDocument()
    expect(screen.getByTestId('summary-Тренировка')).toHaveTextContent('✗')
    fireEvent.change(screen.getByLabelText('Главное на завтра'), { target: { value: 'd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    await waitFor(async () => expect((await db.journal.get('r1'))?.items).toEqual(['a', 'b', 'd']))
    expect(await db.journal.count()).toBe(1)
  })
})

describe('MeditatePage', () => {
  it('saves a meditation session and plays a gong when the timer reaches zero', async () => {
    const frequencies: number[] = []
    class FakeParam {
      setValueAtTime(v: number) {
        frequencies.push(v)
      }
      exponentialRampToValueAtTime() {}
    }
    class FakeNode {
      gain = new FakeParam()
      frequency = new FakeParam()
      type = ''
      connect() {}
      start() {}
      stop() {}
    }
    class FakeAudioContext {
      state = 'running'
      currentTime = 0
      destination = {}
      createOscillator() {
        return new FakeNode()
      }
      createGain() {
        return new FakeNode()
      }
      resume() {
        return Promise.resolve()
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    renderAt('/mind/meditate')
    fireEvent.click(screen.getByRole('button', { name: '5 мин' }))
    expect(screen.getByRole('timer')).toHaveTextContent('5:00')
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }))
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('timer')).toHaveTextContent('4:00')
    // Pause does not count.
    fireEvent.click(screen.getByRole('button', { name: 'Пауза' }))
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('timer')).toHaveTextContent('4:00')
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    act(() => vi.advanceTimersByTime(240_000))
    expect(screen.getByText('Медитация завершена')).toBeInTheDocument()
    vi.useRealTimers()

    await waitFor(async () => expect(await db.mindSessions.count()).toBe(1))
    expect((await db.mindSessions.toArray())[0]).toMatchObject({ kind: 'meditation', durationMin: 5, preset: 'timer-5', date: today() })
    expect(await screen.findByText('Сохранено: 5 минут')).toBeInTheDocument()
    expect(frequencies).toContain(528)
    vi.unstubAllGlobals()
  })

  it('«Завершить раньше» saves the actual time for a prayer timer', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    renderAt('/mind/meditate?kind=prayer&min=20')
    expect(screen.getByRole('heading', { name: 'Молитва' })).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('20:00')
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }))
    act(() => vi.advanceTimersByTime(185_000))
    fireEvent.click(screen.getByRole('button', { name: 'Завершить раньше' }))
    vi.useRealTimers()
    await waitFor(async () => expect(await db.mindSessions.count()).toBe(1))
    expect((await db.mindSessions.toArray())[0]).toMatchObject({ kind: 'prayer', durationMin: 3, preset: 'timer-20' })
  })

  it('does not save an accidental start and supports a custom duration', async () => {
    renderAt('/mind/meditate?kind=reading_spiritual')
    fireEvent.click(screen.getByRole('button', { name: 'Своё' }))
    fireEvent.change(screen.getByLabelText('Своя длительность, минут'), { target: { value: '7' } })
    expect(screen.getByRole('timer')).toHaveTextContent('7:00')
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }))
    fireEvent.click(screen.getByRole('button', { name: 'Завершить раньше' }))
    expect(await screen.findByText(/практика не сохранена/)).toBeInTheDocument()
    expect(await db.mindSessions.count()).toBe(0)
  })
})

describe('BreathePage', () => {
  it('runs box breathing through inhale → hold → exhale → hold and saves the session', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    renderAt('/mind/breathe')
    fireEvent.click(screen.getByRole('radio', { name: /Box 4-4-4-4/ }))
    fireEvent.change(screen.getByLabelText('Количество циклов'), { target: { value: '1' } })
    expect(screen.getByTestId('breath-phase')).toHaveTextContent('Готовы?')
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }))

    const phase = () => screen.getByTestId('breath-phase').textContent
    const seen = [phase()]
    expect(screen.getByTestId('breath-circle').style.transform).toBe('scale(1)')
    for (let i = 0; i < 3; i++) {
      act(() => vi.advanceTimersByTime(4_000))
      seen.push(phase())
    }
    expect(seen).toEqual(['Вдох', 'Задержка', 'Выдох', 'Задержка'])
    expect(screen.getByTestId('breath-circle').style.transform).toBe('scale(0.55)')
    act(() => vi.advanceTimersByTime(4_000))
    expect(screen.getByText('Практика завершена')).toBeInTheDocument()
    vi.useRealTimers()

    await waitFor(async () => expect(await db.mindSessions.count()).toBe(1))
    expect((await db.mindSessions.toArray())[0]).toMatchObject({ kind: 'breathing', preset: 'box-4-4-4-4', durationMin: 1 })
  })

  it('4-7-8 shows the cycle counter and seconds left in the phase', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    renderAt('/mind/breathe?pattern=4-7-8')
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }))
    expect(screen.getByTestId('breath-cycle')).toHaveTextContent('Цикл 1 из 4')
    act(() => vi.advanceTimersByTime(5_000))
    expect(screen.getByTestId('breath-phase')).toHaveTextContent('Задержка')
    expect(screen.getByLabelText('Секунд в фазе')).toHaveTextContent('6')
    act(() => vi.advanceTimersByTime(15_000))
    expect(screen.getByTestId('breath-cycle')).toHaveTextContent('Цикл 2 из 4')
  })
})
