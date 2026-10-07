import { db } from '../../../db'
import type { ISODate } from '../../../db/types'
import { today } from '../../../lib/dates'
import { newId } from '../../../lib/id'

/** Log a reading session; a book still on the "want" shelf moves to "reading". */
export async function logReading(
  bookId: string,
  entry: { pages: number; minutes?: number; note?: string; date?: ISODate },
): Promise<void> {
  const date = entry.date ?? today()
  await db.transaction('rw', db.books, db.readingLogs, async () => {
    const book = await db.books.get(bookId)
    if (!book) return
    await db.readingLogs.add({
      id: newId(),
      bookId,
      date,
      pages: Math.max(0, Math.round(entry.pages || 0)),
      minutes: entry.minutes ? Math.max(0, Math.round(entry.minutes)) : undefined,
      note: entry.note?.trim() || undefined,
      createdAt: new Date().toISOString(),
    })
    if (book.status === 'want' || book.status === 'dropped') {
      await db.books.update(bookId, { status: 'reading', startedAt: book.startedAt ?? date })
    }
  })
}

/** The "+ 20 мин" quick button. */
export function logTwentyMinutes(bookId: string): Promise<void> {
  return logReading(bookId, { pages: 0, minutes: 20 })
}
