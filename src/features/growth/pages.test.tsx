import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { DEFAULT_PROFILE } from '../../db/seed'
import type { Book } from '../../db/types'
import { today } from '../../lib/dates'
import { HabitsTodayCard, ReadingTodayCard } from './cards'
import { habitLogId } from './habits/calc'
import { growthRoutes } from './routes'
import { shiftDate } from './shared'

function renderAt(path: string, routes: RouteObject[] = growthRoutes) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const book = (over: Partial<Book>): Book => ({
  id: 'b1',
  title: 'Атомные привычки',
  author: 'Джеймс Клир',
  totalPages: 300,
  status: 'reading',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

beforeEach(async () => {
  await Promise.all([
    db.habits.clear(),
    db.habitLogs.clear(),
    db.books.clear(),
    db.readingLogs.clear(),
    db.settings.clear(),
    db.water.clear(),
    db.sleep.clear(),
    db.sessions.clear(),
    db.activities.clear(),
    db.profile.clear(),
  ])
  await db.profile.put({ ...DEFAULT_PROFILE, waterTargetMl: 2000 })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('BooksPage', () => {
  it('renders the shelf with 2 books, progress, goal and weekly stats', async () => {
    await db.books.bulkAdd([
      book({ id: 'b1' }),
      book({ id: 'b2', title: 'Дюна', author: 'Фрэнк Герберт', totalPages: 600, coverUrl: 'https://example.com/c.jpg' }),
      book({ id: 'b3', title: 'Старая', status: 'done', finishedAt: `${today().slice(0, 4)}-01-15` }),
    ])
    await db.readingLogs.bulkAdd([
      { id: 'l1', bookId: 'b1', date: today(), pages: 75, minutes: 40, createdAt: new Date().toISOString() },
      { id: 'l2', bookId: 'b2', date: today(), pages: 60, createdAt: new Date().toISOString() },
    ])
    renderAt('/books')

    const shelf = await screen.findByRole('list', { name: 'Полка: Читаю' })
    await waitFor(() => expect(within(shelf).getAllByTestId('book-row')).toHaveLength(2))
    expect(within(shelf).getByText('Атомные привычки')).toBeInTheDocument()
    expect(within(shelf).getByText('Джеймс Клир')).toBeInTheDocument()
    expect(within(shelf).getByText('75 / 300 стр · 25%')).toBeInTheDocument()
    expect(within(shelf).getByText('60 / 600 стр · 10%')).toBeInTheDocument()
    // placeholder with initials for the book without a cover
    expect(within(shelf).getByTestId('cover-placeholder')).toHaveTextContent('АП')
    expect(screen.getByTestId('books-goal')).toHaveTextContent('1 / 12')
    expect(screen.getByText('Страниц за неделю').parentElement).toHaveTextContent('135')
    expect(screen.getByText('Минут за неделю').parentElement).toHaveTextContent('40')

    // quick +20 min logs a session
    fireEvent.click(within(shelf).getByRole('button', { name: '+ 20 мин чтения: Дюна' }))
    await waitFor(async () => expect(await db.readingLogs.where('bookId').equals('b2').count()).toBe(2))

    // tabs
    fireEvent.click(screen.getByRole('tab', { name: /Прочитано/ }))
    const done = await screen.findByRole('list', { name: 'Полка: Прочитано' })
    expect(within(done).getByText('Старая')).toBeInTheDocument()
  })

  it('edits the yearly goal stored in settings', async () => {
    renderAt('/books')
    await screen.findByText('Сейчас ничего не читаете')
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Книг за год'), { target: { value: '20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(screen.getByTestId('books-goal')).toHaveTextContent('0 / 20'))
    expect((await db.settings.get('booksGoalYear'))?.value).toBe(20)
  })
})

describe('BookNewPage', () => {
  it('saves a book; cover lookup fails silently when offline', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const router = renderAt('/books/new')
    fireEvent.change(screen.getByLabelText(/^Название/), { target: { value: 'Дюна' } })
    fireEvent.change(screen.getByLabelText(/^Автор/), { target: { value: 'Фрэнк Герберт' } })
    fireEvent.change(screen.getByLabelText(/^Страниц/), { target: { value: '600' } })
    fireEvent.change(screen.getByLabelText(/^Статус/), { target: { value: 'reading' } })
    fireEvent.change(screen.getByLabelText(/^Теги/), { target: { value: 'фантастика, классика' } })
    fireEvent.click(screen.getByRole('button', { name: 'Найти обложку' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(String(fetchMock.mock.calls[0][0])).toContain('openlibrary.org/search.json?title=')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Найти обложку' })).toBeEnabled())
    expect(screen.getByLabelText(/^Обложка/)).toHaveValue('')

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/books\/.+/))
    const [saved] = await db.books.toArray()
    expect(saved).toMatchObject({
      title: 'Дюна',
      author: 'Фрэнк Герберт',
      totalPages: 600,
      status: 'reading',
      tags: ['фантастика', 'классика'],
      startedAt: today(),
    })
    expect(saved.coverUrl).toBeUndefined()
  })

  it('fills the cover from Open Library', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ docs: [{ title: 'Dune', author_name: ['Frank Herbert'], cover_i: 42, number_of_pages_median: 412 }] }),
      }),
    )
    renderAt('/books/new')
    fireEvent.change(screen.getByLabelText(/^Название/), { target: { value: 'Dune' } })
    fireEvent.click(screen.getByRole('button', { name: 'Найти обложку' }))
    await waitFor(() => expect(screen.getByLabelText(/^Обложка/)).toHaveValue('https://covers.openlibrary.org/b/id/42-M.jpg'))
    expect(screen.getByLabelText(/^Автор/)).toHaveValue('Frank Herbert')
    expect(screen.getByLabelText(/^Страниц/)).toHaveValue(412)
  })
})

describe('BookPage', () => {
  it('logs sessions, lists thoughts and offers to finish the book', async () => {
    await db.books.add(book({ totalPages: 100 }))
    await db.readingLogs.add({ id: 'l1', bookId: 'b1', date: shiftDate(today(), -1), pages: 90, minutes: 60, createdAt: new Date().toISOString() })
    renderAt('/books/b1')
    expect(await screen.findByTestId('book-progress')).toHaveTextContent('Страница 90 из 100 · 90%')
    expect(screen.queryByText(/Книга дочитана/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Записать чтение' }))
    const dialog = screen.getByRole('dialog', { name: 'Сессия чтения' })
    fireEvent.change(within(dialog).getByLabelText('Страницы'), { target: { value: '10' } })
    fireEvent.change(within(dialog).getByLabelText('Минуты'), { target: { value: '15' } })
    fireEvent.change(within(dialog).getByLabelText(/^Заметка или цитата/), { target: { value: 'Системы важнее целей' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(screen.getByTestId('book-progress')).toHaveTextContent('Страница 100 из 100 · 100%'))
    expect(screen.getAllByTestId('reading-log')).toHaveLength(2)
    expect(within(screen.getByRole('region', { name: 'Мысли из книги' })).getByText('Системы важнее целей')).toBeInTheDocument()

    // finish prompt
    expect(await screen.findByText(/Книга дочитана/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Оценка 5' }))
    fireEvent.change(screen.getByLabelText(/^Итоговая заметка/), { target: { value: 'Маленькие шаги' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отметить «Прочитано»' }))
    await waitFor(async () => expect((await db.books.get('b1'))?.status).toBe('done'))
    expect(await db.books.get('b1')).toMatchObject({ rating: 5, notes: 'Маленькие шаги', finishedAt: today() })
    await waitFor(() => expect(screen.queryByText(/Книга дочитана/)).not.toBeInTheDocument())
    expect(screen.getByText('Маленькие шаги')).toBeInTheDocument()
  })

  it('edits and deletes the book', async () => {
    await db.books.add(book({}))
    await db.readingLogs.add({ id: 'l1', bookId: 'b1', date: today(), pages: 5, createdAt: new Date().toISOString() })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const router = renderAt('/books/b1')
    fireEvent.click(await screen.findByRole('button', { name: 'Изменить' }))
    const dialog = screen.getByRole('dialog', { name: 'Редактировать книгу' })
    fireEvent.change(within(dialog).getByLabelText(/^Название/), { target: { value: 'Атомные привычки (2-е изд.)' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(async () => expect((await db.books.get('b1'))?.title).toBe('Атомные привычки (2-е изд.)'))

    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить книгу' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/books'))
    expect(await db.books.count()).toBe(0)
    expect(await db.readingLogs.count()).toBe(0)
  })
})

describe('HabitsPage', () => {
  it('seeds default habits, toggles a habit and shows auto completion', async () => {
    await db.water.bulkAdd([
      { id: 'w1', date: today(), ml: 1200, createdAt: new Date().toISOString() },
      { id: 'w2', date: today(), ml: 900, createdAt: new Date().toISOString() },
    ])
    renderAt('/habits')
    const list = await screen.findByRole('list', { name: 'Чеклист' })
    await waitFor(() => expect(within(list).getAllByRole('checkbox')).toHaveLength(8))

    // water is auto-completed (2100 ≥ 2000 ml) with the "авто" label
    const water = within(list).getByRole('checkbox', { name: '3 л воды' })
    expect(water).toHaveAttribute('aria-checked', 'true')
    expect(within(water).getByText('авто')).toBeInTheDocument()

    // manual toggle
    const noSugar = within(list).getByRole('checkbox', { name: 'Без сахара' })
    expect(noSugar).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(noSugar)
    await waitFor(() => expect(within(list).getByRole('checkbox', { name: 'Без сахара' })).toHaveAttribute('aria-checked', 'true'))
    expect(await db.habitLogs.get(habitLogId('habit-no-sugar', today()))).toMatchObject({ done: true })

    // manual click still works on an auto-completed habit (writes a "not done" log)
    fireEvent.click(within(list).getByRole('checkbox', { name: '3 л воды' }))
    await waitFor(async () => expect((await db.habitLogs.get(habitLogId('habit-water', today())))?.done).toBe(false))

    // statistics section
    expect(screen.getByTestId('stat-habit-no-sugar')).toHaveTextContent('3%')
  })

  it('switches to yesterday to mark it, and the streak counts', async () => {
    renderAt('/habits')
    await screen.findAllByRole('checkbox')
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий день' }))
    expect(screen.getByTestId('habits-day')).toHaveTextContent('Вчера')
    fireEvent.click(await screen.findByRole('checkbox', { name: '10 000 шагов' }))
    await waitFor(async () => expect(await db.habitLogs.get(habitLogId('habit-steps', shiftDate(today(), -1)))).toBeTruthy())
    // today is not marked yet, the streak from yesterday is still 1 day
    expect(await screen.findByLabelText('Серия: 1 день')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Следующий день' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Следующий день' }))
    expect(screen.getByTestId('habits-day')).toHaveTextContent('Сегодня')
    expect(screen.getByRole('button', { name: 'Следующий день' })).toBeDisabled()
  })

  it('hides archived habits behind "Показать архив"', async () => {
    await db.settings.put({ key: 'habitsSeeded', value: true })
    await db.habits.bulkAdd([
      { id: 'h1', name: 'Медитация', icon: '🧠', color: 'violet', frequency: 'daily', autoRule: null, sort: 0, archived: false, createdAt: new Date().toISOString() },
      { id: 'h2', name: 'Старая', icon: '🎸', color: 'pink', frequency: 'daily', autoRule: null, sort: 1, archived: true, createdAt: new Date().toISOString() },
    ])
    renderAt('/habits')
    expect(await screen.findByRole('checkbox', { name: 'Медитация' })).toBeInTheDocument()
    expect(screen.queryByText('Старая')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Показать архив (1)' }))
    expect(screen.getByRole('link', { name: /Старая/ })).toHaveAttribute('href', '/habits/h2')
  })
})

describe('HabitEditPage', () => {
  it('creates a weekly habit with icon, colour and auto rule', async () => {
    await db.settings.put({ key: 'habitsSeeded', value: true })
    const router = renderAt('/habits/new')
    fireEvent.change(screen.getByLabelText(/^Название/), { target: { value: 'Бассейн' } })
    fireEvent.click(screen.getByRole('button', { name: 'Иконка 🏊' }))
    fireEvent.click(screen.getByRole('button', { name: 'Фиолетовый' }))
    fireEvent.click(screen.getByRole('button', { name: 'N раз в неделю' }))
    fireEvent.change(screen.getByLabelText('Раз в неделю'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/^Авто-отметка/), { target: { value: 'cardio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/habits'))
    const [h] = await db.habits.toArray()
    expect(h).toMatchObject({ name: 'Бассейн', icon: '🏊', color: 'violet', frequency: 'weekly', targetPerWeek: 2, autoRule: 'cardio', archived: false })
  })

  it('archives and deletes a habit with its logs', async () => {
    await db.settings.put({ key: 'habitsSeeded', value: true })
    await db.habits.add({ id: 'h1', name: 'Медитация', icon: '🧠', color: 'violet', frequency: 'daily', autoRule: null, sort: 0, archived: false, createdAt: new Date().toISOString() })
    await db.habitLogs.add({ id: 'x', habitId: 'h1', date: today(), done: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const router = renderAt('/habits/h1')
    expect(await screen.findByLabelText(/^Название/)).toHaveValue('Медитация')
    fireEvent.click(screen.getByRole('button', { name: 'Архивировать' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/habits'))
    expect((await db.habits.get('h1'))?.archived).toBe(true)

    await act(() => router.navigate('/habits/h1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }))
    await waitFor(async () => expect(await db.habits.count()).toBe(0))
    expect(await db.habitLogs.count()).toBe(0)
  })
})

describe('GrowthPage hub', () => {
  it('shows habits today, the current book, last night and the all-habits streak', async () => {
    await db.settings.put({ key: 'habitsSeeded', value: true })
    const createdAt = new Date().toISOString()
    await db.habits.bulkAdd([
      { id: 'h1', name: 'А', icon: '🧠', color: 'violet', frequency: 'daily', autoRule: null, sort: 0, archived: false, createdAt },
      { id: 'h2', name: 'Б', icon: '🎸', color: 'pink', frequency: 'daily', autoRule: null, sort: 1, archived: false, createdAt },
    ])
    const y1 = shiftDate(today(), -1)
    const y2 = shiftDate(today(), -2)
    await db.habitLogs.bulkAdd([
      { id: '1', habitId: 'h1', date: y1, done: true },
      { id: '2', habitId: 'h2', date: y1, done: true },
      { id: '3', habitId: 'h1', date: y2, done: true },
      { id: '4', habitId: 'h2', date: y2, done: true },
      { id: '5', habitId: 'h1', date: today(), done: true },
    ])
    await db.books.add(book({ totalPages: 200 }))
    await db.readingLogs.add({ id: 'l', bookId: 'b1', date: today(), pages: 50, createdAt })
    const bed = new Date()
    bed.setDate(bed.getDate() - 1)
    bed.setHours(23, 0, 0, 0)
    const wake = new Date()
    wake.setHours(7, 0, 0, 0)
    await db.sleep.add({ id: 's', date: today(), bedtime: bed.toISOString(), wakeTime: wake.toISOString(), durationMin: 480, quality: 4 })

    renderAt('/growth')
    await waitFor(() => expect(screen.getByTestId('hub-habits')).toHaveTextContent('Сегодня выполнено 1 из 2'))
    expect(screen.getByTestId('growth-streak')).toHaveTextContent('Серия: 2 дня')
    expect(screen.getByTestId('hub-book')).toHaveTextContent('Атомные привычки')
    expect(screen.getByText('25% прочитано')).toBeInTheDocument()
    expect(await screen.findByText(/Прошлая ночь: 8 ч 00 мин/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Сон/ })).toHaveAttribute('href', '/sleep')
  })
})

describe('dashboard cards', () => {
  it('HabitsTodayCard toggles today; ReadingTodayCard logs 20 minutes', async () => {
    await db.books.add(book({}))
    renderAt('/', [
      {
        path: '/',
        element: (
          <>
            <HabitsTodayCard />
            <ReadingTodayCard />
          </>
        ),
      },
    ])
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(8))
    expect(screen.getByTestId('habits-today-count')).toHaveTextContent('0 из 8')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Тренировка' }))
    await waitFor(() => expect(screen.getByTestId('habits-today-count')).toHaveTextContent('1 из 8'))

    fireEvent.click(screen.getByRole('button', { name: 'Записать 20 мин' }))
    await waitFor(async () => expect(await db.readingLogs.count()).toBe(1))
    expect((await db.readingLogs.toArray())[0]).toMatchObject({ bookId: 'b1', minutes: 20, pages: 0, date: today() })
    // the reading habit is auto-completed by the 20-minute log
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Чтение 20 мин' })).toHaveAttribute('aria-checked', 'true'))
  })
})
