import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../db'
import { currentBook, pagesRead, progressPercent } from './calc'

/** The book being read right now with its progress, `null` if none. */
export function useCurrentBook() {
  return useLiveQuery(async () => {
    const [reading, logs] = await Promise.all([
      db.books.where('status').equals('reading').toArray(),
      db.readingLogs.toArray(),
    ])
    const book = currentBook(reading, logs)
    if (!book) return { book: null, count: 0, read: 0, percent: 0 }
    const read = pagesRead(logs.filter((l) => l.bookId === book.id))
    return { book, count: reading.length, read, percent: progressPercent(read, book.totalPages) }
  }, [])
}
