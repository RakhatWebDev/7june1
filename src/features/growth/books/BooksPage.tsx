import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import {
  Button,
  Card,
  CountUp,
  EmptyState,
  LinkButton,
  PageHeader,
  Progress,
  Ring,
  SegmentedControl,
  Sheet,
  Stat,
  Stepper,
} from '../../../components/ui'
import { useReduceMotion } from '../../../components/ui/helpers'
import { db } from '../../../db'
import type { Book, BookStatus, ReadingLog } from '../../../db/types'
import { today, weekDates } from '../../../lib/dates'
import { int } from '../../../lib/format'
import { Icon } from '../../../components/icons'
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

const EASE_OUT = [0.22, 1, 0.36, 1] as const

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

  const reduce = useReduceMotion()
  const left = Math.max(0, goal - finished)

  return (
    <>
      <PageHeader
        title="Книги"
        back="/growth"
        action={
          <LinkButton to="/books/new" size="sm" icon="plus">
            Добавить
          </LinkButton>
        }
      />

      <Card variant="elevated" tone="amber" className="mb-3 flex items-center gap-4">
        <Ring
          value={goal > 0 ? finished / goal : 0}
          size={92}
          stroke={9}
          tone="amber"
          aria-label={`Прочитано ${finished} из ${goal} книг`}
        >
          <span className="flex flex-col items-center leading-none">
            <CountUp value={finished} className="text-[26px] font-bold tracking-tight" />
            <span className="mt-1 text-[11px] text-muted tabular-nums">из {goal}</span>
          </span>
        </Ring>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Цель на {year} год</h2>
            <Button variant="ghost" size="sm" icon="edit" className="-mr-2 min-h-8 px-2" onClick={() => setGoalOpen(true)}>
              Изменить
            </Button>
          </div>
          <div className="text-2xl leading-tight font-bold tracking-tight tabular-nums" data-testid="books-goal">
            {finished} / {goal}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {left === 0 ? 'Цель года достигнута!' : `Осталось ${left} — по одной за раз`}
          </p>
        </div>
      </Card>

      <section aria-label="Статистика чтения" className="mb-4 grid grid-cols-3 gap-2">
        <Stat icon="book" tone="amber" label="Страниц за неделю" value={int(week.pages)} />
        <Stat icon="timer" tone="amber" label="Минут за неделю" value={int(week.minutes)} />
        <Stat icon="trophy" tone="amber" label="Книг за год" value={finished} />
      </section>

      <div className="-mx-4 mb-3 overflow-x-auto px-4 no-scrollbar">
        <SegmentedControl
          aria-label="Полки"
          size="sm"
          className="w-max min-w-full"
          value={tab}
          onChange={(s) => setParams({ tab: s }, { replace: true })}
          options={STATUS_ORDER.map((s) => ({
            value: s,
            label: (
              <span className="flex flex-col items-center py-1 leading-tight">
                <span>{STATUS_RU[s]}</span>
                <span className="text-[10px] font-normal text-muted tabular-nums">
                  {books.filter((b) => b.status === s).length}
                </span>
              </span>
            ),
          }))}
        />
      </div>

      {data && shelf.length === 0 ? (
        <EmptyState
          icon="book"
          tone="amber"
          title={tab === 'reading' ? 'Сейчас ничего не читаете' : `Полка «${STATUS_RU[tab]}» пуста`}
          hint={tab === 'reading' ? 'Добавьте книгу или начните одну из списка «Хочу».' : undefined}
          action={
            <LinkButton to="/books/new" icon="plus">
              Добавить книгу
            </LinkButton>
          }
        />
      ) : (
        <ul className="space-y-2.5" aria-label={`Полка: ${STATUS_RU[tab]}`}>
          {shelf.map((b, i) => (
            <motion.li
              key={`${tab}-${b.id}`}
              data-testid="book-row"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: EASE_OUT, delay: Math.min(i, 9) * 0.04 }}
            >
              <BookRow book={b} logs={byBook.get(b.id) ?? []} />
            </motion.li>
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
    <Card as="div" className="flex items-center gap-3 p-3 transition-[border-color] hover:border-white/15">
      <Link to={`/books/${book.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <BookCover book={book} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold tracking-tight">{book.title}</div>
          {book.author && <div className="truncate text-sm text-muted">{book.author}</div>}
          {book.totalPages ? (
            <div className="mt-2">
              <Progress value={bookProgress(read, book.totalPages)} tone="amber" className="h-1.5" />
              <div className="mt-1 text-xs text-muted tabular-nums">
                {Math.min(read, book.totalPages)} / {book.totalPages} стр · {pct}%
              </div>
            </div>
          ) : (
            book.status === 'done' &&
            book.rating && (
              <div className="mt-1 flex gap-0.5 text-amber" aria-label={`Оценка ${book.rating} из 5`}>
                {Array.from({ length: book.rating }, (_, i) => (
                  <Icon key={i} name="star" size={13} fill="currentColor" />
                ))}
              </div>
            )
          )}
        </div>
      </Link>
      {book.status === 'reading' && (
        <Button
          variant="secondary"
          size="sm"
          icon="plus"
          className="shrink-0 gap-1 rounded-full px-3 text-amber"
          aria-label={`+ 20 мин чтения: ${book.title}`}
          onClick={() => void logTwentyMinutes(book.id)}
        >
          20 мин
        </Button>
      )}
    </Card>
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
        <Button variant="secondary" className="flex-1" onClick={onClose}>
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
