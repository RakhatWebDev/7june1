import { describe, expect, it } from 'vitest'
import type { Book } from '../../../db/types'
import {
  bookProgress,
  booksFinishedInYear,
  currentBook,
  initials,
  logsByBook,
  pagesRead,
  parseTags,
  periodStats,
  progressPercent,
} from './calc'

const book = (over: Partial<Book>): Book => ({
  id: 'b',
  title: 'Книга',
  status: 'reading',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('progress', () => {
  it('sums pages and computes the percentage', () => {
    const read = pagesRead([{ pages: 40 }, { pages: 35 }, { pages: 0 }])
    expect(read).toBe(75)
    expect(bookProgress(read, 300)).toBeCloseTo(0.25)
    expect(progressPercent(read, 300)).toBe(25)
    expect(progressPercent(299, 300)).toBe(99) // never rounds up to 100 before the end
  })

  it('is capped at 100% and 0 without a page count', () => {
    expect(progressPercent(350, 300)).toBe(100)
    expect(progressPercent(50, undefined)).toBe(0)
    expect(bookProgress(50, 0)).toBe(0)
  })
})

describe('periodStats', () => {
  it('sums pages and minutes on the given week dates only', () => {
    const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']
    const logs = [
      { date: '2026-10-05', pages: 20, minutes: 30 },
      { date: '2026-10-07', pages: 0, minutes: 20 },
      { date: '2026-10-11', pages: 15 },
      { date: '2026-10-04', pages: 100, minutes: 90 }, // previous week
    ]
    expect(periodStats(logs, week)).toEqual({ pages: 35, minutes: 50, sessions: 3 })
  })
})

describe('booksFinishedInYear', () => {
  it('counts done books finished in that year', () => {
    const books = [
      book({ status: 'done', finishedAt: '2026-02-01' }),
      book({ status: 'done', finishedAt: '2026-12-31' }),
      book({ status: 'done', finishedAt: '2025-12-31' }),
      book({ status: 'reading' }),
      book({ status: 'dropped', finishedAt: '2026-03-01' }),
    ]
    expect(booksFinishedInYear(books, 2026)).toBe(2)
    expect(booksFinishedInYear(books, 2025)).toBe(1)
  })
})

describe('helpers', () => {
  it('initials, tags, grouping', () => {
    expect(initials('Атомные привычки')).toBe('АП')
    expect(initials('Дюна')).toBe('ДЮ')
    expect(initials('  ')).toBe('?')
    expect(parseTags(' бизнес, , фантастика,бизнес ')).toEqual(['бизнес', 'фантастика'])
    const g = logsByBook([{ bookId: 'a' }, { bookId: 'b' }, { bookId: 'a' }])
    expect(g.get('a')).toHaveLength(2)
  })

  it('current book is the reading one with the latest log', () => {
    const books = [
      book({ id: 'a', startedAt: '2026-10-01' }),
      book({ id: 'b', startedAt: '2026-09-01' }),
      book({ id: 'c', status: 'want' }),
    ]
    expect(currentBook(books, [])?.id).toBe('a')
    expect(currentBook(books, [{ bookId: 'b', createdAt: '2026-10-07T10:00:00.000Z' }])?.id).toBe('b')
    expect(currentBook([book({ status: 'done' })], [])).toBeUndefined()
  })
})
