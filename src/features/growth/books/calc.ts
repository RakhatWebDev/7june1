import type { Book, BookStatus, ISODate, ReadingLog } from '../../../db/types'

export const BOOKS_GOAL_KEY = 'booksGoalYear'
export const DEFAULT_BOOKS_GOAL = 12

export const STATUS_RU: Record<BookStatus, string> = {
  reading: 'Читаю',
  want: 'Хочу',
  done: 'Прочитано',
  dropped: 'Брошено',
}

/** Shelf tab order: reading, want, done, dropped last. */
export const STATUS_ORDER: BookStatus[] = ['reading', 'want', 'done', 'dropped']

/** Pages read so far = sum of logged pages. */
export function pagesRead(logs: Pick<ReadingLog, 'pages'>[]): number {
  return logs.reduce((s, l) => s + (l.pages || 0), 0)
}

/** Reading progress 0..1 (0 when the page count is unknown). */
export function bookProgress(read: number, totalPages: number | undefined): number {
  if (!totalPages || totalPages <= 0) return 0
  return Math.max(0, Math.min(1, read / totalPages))
}

/** Reading progress as an integer percentage 0..100. */
export function progressPercent(read: number, totalPages: number | undefined): number {
  return Math.floor(bookProgress(read, totalPages) * 100)
}

/** Pages and minutes logged on the given dates (e.g. `weekDates()`). */
export function periodStats(
  logs: Pick<ReadingLog, 'date' | 'pages' | 'minutes'>[],
  dates: ISODate[],
): { pages: number; minutes: number; sessions: number } {
  const set = new Set(dates)
  let pages = 0
  let minutes = 0
  let sessions = 0
  for (const l of logs) {
    if (!set.has(l.date)) continue
    pages += l.pages || 0
    minutes += l.minutes ?? 0
    sessions++
  }
  return { pages, minutes, sessions }
}

/** Books finished (status `done`) with `finishedAt` in the given year. */
export function booksFinishedInYear(books: Pick<Book, 'status' | 'finishedAt'>[], year: number): number {
  const prefix = `${year}-`
  return books.filter((b) => b.status === 'done' && b.finishedAt?.startsWith(prefix)).length
}

/** Group logs by book id. */
export function logsByBook<T extends Pick<ReadingLog, 'bookId'>>(logs: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const l of logs) {
    const arr = m.get(l.bookId)
    if (arr) arr.push(l)
    else m.set(l.bookId, [l])
  }
  return m
}

/** Up to two initials from the title (or author) for a cover placeholder. */
export function initials(title: string): string {
  const words = title
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const PLACEHOLDER_COLORS = ['accent', 'info', 'warn', 'danger', 'violet', 'pink']

/** Deterministic placeholder colour token for a title. */
export function placeholderColor(title: string): string {
  let h = 0
  for (const ch of title) h = (h * 31 + ch.codePointAt(0)!) | 0
  return PLACEHOLDER_COLORS[Math.abs(h) % PLACEHOLDER_COLORS.length]
}

/** Parse "фантастика, бизнес" into trimmed unique tags. */
export function parseTags(s: string): string[] {
  return [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))]
}

/**
 * The book to show as "current": among `reading` books, the one with the most
 * recent reading log (fallback: latest `startedAt`/`createdAt`).
 */
export function currentBook<B extends Pick<Book, 'id' | 'status' | 'startedAt' | 'createdAt'>>(
  books: B[],
  logs: Pick<ReadingLog, 'bookId' | 'createdAt'>[],
): B | undefined {
  const reading = books.filter((b) => b.status === 'reading')
  if (reading.length === 0) return undefined
  const lastLog = new Map<string, string>()
  for (const l of logs) {
    const prev = lastLog.get(l.bookId)
    if (!prev || l.createdAt > prev) lastLog.set(l.bookId, l.createdAt)
  }
  const key = (b: B) => lastLog.get(b.id) ?? b.startedAt ?? b.createdAt
  return [...reading].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0))[0]
}
