import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useSearchParams } from 'react-router'
import { Button, Card, EmptyState, PageHeader, Progress, Sheet, Stat, Stepper } from '../../../components/ui'
import { db } from '../../../db'
import type { Book, BookStatus, ReadingLog } from '../../../db/types'
import { today, weekDates } from '../../../lib/dates'
import { int } from '../../../lib/format'
import { logTwentyMinutes } from './actions'
import { BookCover } from './BookCover'
import {
  BOOKS_GOAL_KEY,
  bookProgress,
  booksFinishedInYear,
  DEFAULT_BOOKS_GOAL,
  logsByBook,
  pagesRead,
  periodStats,
  progressPercent,
  STATUS_ORDER,
  STATUS_RU,
} from './calc'

const linkBtn = 'rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-strong'

export function BooksPage() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as BookStatus | null
  const tab: BookStatus = tabParam && STATUS_ORDER.includes(tabParam) ? tabParam : 'reading'
  const [goalOpen, setGoalOpen] = useState(false)

  const data = useLiveQuery(async () => {
    const [books, logs, goal] = await Promise.all([
      db.books.toArray(),
      db.readingLogs.toArray(),
      db.settings.get(BOOKS_GOAL_KEY),
    ])
    return { books, logs, goal: typeof goal?.value === 'number' ? goal.value : DEFAULT_BOOKS_GOAL }
  }, [])

  const books = data?.books ?? []
  const logs = data?.logs ?? []
  const byBook = logsByBook(logs)
  const year = Number(today().slice(0, 4))
  const finished = booksFinishedInYear(books, year)
  const goal = data?.goal ?? DEFAULT_BOOKS_GOAL
  const week = periodStats(logs, weekDates())
  const shelf = books
    .filter((b) => b.status === tab)
    .sort((a, b) => (tab === 'done' ? (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '') : b.createdAt.localeCompare(a.createdAt)))

  return (
    <>
      <PageHeader title="Книги" back="/growth" action={<Link to="/books/new" className={linkBtn}>+ Добавить</Link>} />

      <Card className="mb-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-muted">Цель на {year} год</h2>
          <button type="button" className="text-xs text-muted hover:text-text" onClick={() => setGoalOpen(true)}>
            Изменить
          </button>
        </div>
        <div className="mb-2 text-2xl font-bold tabular-nums" data-testid="books-goal">
          {finished} / {goal}
        </div>
        <Progress value={goal > 0 ? finished / goal : 0} />
      </Card>

      <section aria-label="Статистика чтения" className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Страниц за неделю" value={int(week.pages)} />
        <Stat label="Минут за неделю" value={int(week.minutes)} />
        <Stat label="Книг за год" value={finished} />
      </section>

      <div role="tablist" aria-label="Полки" className="mb-3 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1">
        {STATUS_ORDER.map((s) => {
          const n = books.filter((b) => b.status === s).length
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={tab === s}
              onClick={() => setParams({ tab: s }, { replace: true })}
              className={`min-h-10 flex-1 rounded-xl px-3 text-sm whitespace-nowrap transition-colors ${
                tab === s ? 'bg-surface-2 font-semibold text-text' : 'text-muted hover:text-text'
              } ${s === 'dropped' ? 'flex-none' : ''}`}
            >
              {STATUS_RU[s]} <span className="text-xs text-muted tabular-nums">{n}</span>
            </button>
          )
        })}
      </div>

      {data && shelf.length === 0 ? (
        <EmptyState
          title={tab === 'reading' ? 'Сейчас ничего не читаете' : `Полка «${STATUS_RU[tab]}» пуста`}
          hint={tab === 'reading' ? 'Добавьте книгу или начните одну из списка «Хочу».' : undefined}
          action={<Link to="/books/new" className={linkBtn}>Добавить книгу</Link>}
        />
      ) : (
        <ul className="space-y-2" aria-label={`Полка: ${STATUS_RU[tab]}`}>
          {shelf.map((b) => (
            <BookRow key={b.id} book={b} logs={byBook.get(b.id) ?? []} />
          ))}
        </ul>
      )}

      {goalOpen && <GoalSheet goal={goal} onClose={() => setGoalOpen(false)} />}
    </>
  )
}

function BookRow({ book, logs }: { book: Book; logs: ReadingLog[] }) {
  const read = pagesRead(logs)
  const pct = progressPercent(read, book.totalPages)
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3" data-testid="book-row">
      <Link to={`/books/${book.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <BookCover book={book} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{book.title}</div>
          {book.author && <div className="truncate text-sm text-muted">{book.author}</div>}
          {book.totalPages ? (
            <div className="mt-1.5">
              <Progress value={bookProgress(read, book.totalPages)} />
              <div className="mt-1 text-xs text-muted tabular-nums">
                {Math.min(read, book.totalPages)} / {book.totalPages} стр · {pct}%
              </div>
            </div>
          ) : (
            book.status === 'done' &&
            book.rating && <div className="mt-1 text-xs text-warn">{'★'.repeat(book.rating)}</div>
          )}
        </div>
      </Link>
      {book.status === 'reading' && (
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11 shrink-0"
          aria-label={`+ 20 мин чтения: ${book.title}`}
          onClick={() => void logTwentyMinutes(book.id)}
        >
          + 20 мин
        </Button>
      )}
    </li>
  )
}

function GoalSheet({ goal, onClose }: { goal: number; onClose: () => void }) {
  const [value, setValue] = useState<number | null>(goal)
  return (
    <Sheet open onClose={onClose} title="Цель: книг за год">
      <div className="flex items-center justify-center py-2">
        <Stepper aria-label="Книг за год" value={value ?? goal} min={1} max={365} onChange={setValue} />
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          Отмена
        </Button>
        <Button
          className="flex-1"
          onClick={async () => {
            await db.settings.put({ key: BOOKS_GOAL_KEY, value: Math.max(1, value ?? goal) })
            onClose()
          }}
        >
          Сохранить
        </Button>
      </div>
    </Sheet>
  )
}
