import { Link } from 'react-router'
import { Button, Card, Progress } from '../../components/ui'
import { plural } from '../../lib/format'
import { logTwentyMinutes } from './books/actions'
import { BookCover } from './books/BookCover'
import { bookProgress } from './books/calc'
import { useCurrentBook } from './books/hooks'
import { HabitCheck } from './habits/HabitCheck'
import { useHabitsToday } from './habits/hooks'
import { setHabitDone } from './habits/meta'

/** Compact checklist of today's habits for the "Сегодня" dashboard. */
export function HabitsTodayCard() {
  const summary = useHabitsToday()
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Link to="/habits" className="font-semibold hover:text-accent">
          Привычки
        </Link>
        {summary && (
          <span className="text-sm text-muted tabular-nums" data-testid="habits-today-count">
            {summary.done} из {summary.total}
            {summary.streak > 0 && (
              <>
                {' '}
                · <span aria-hidden>🔥</span> {summary.streak} {plural(summary.streak, ['день', 'дня', 'дней'])}
              </>
            )}
          </span>
        )}
      </div>
      {summary && summary.total === 0 ? (
        <p className="text-sm text-muted">
          Нет активных привычек. <Link to="/habits/new" className="text-accent">Добавить</Link>
        </p>
      ) : (
        <ul className="space-y-1.5">
          {summary?.habits.map((h) => {
            const st = summary.status.get(h.id)
            const done = !!st?.done.has(summary.today)
            return (
              <li key={h.id}>
                <HabitCheck
                  compact
                  icon={h.icon}
                  name={h.name}
                  color={h.color}
                  done={done}
                  auto={!!st?.auto.has(summary.today)}
                  onToggle={() => void setHabitDone(h.id, summary.today, !done)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/** The current book with progress and a quick "+20 min" log for the dashboard. */
export function ReadingTodayCard() {
  const current = useCurrentBook()
  if (current === undefined) return null
  const { book } = current
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Link to="/books" className="font-semibold hover:text-accent">
          Чтение
        </Link>
        {current.count > 1 && <span className="text-xs text-muted">ещё {current.count - 1}</span>}
      </div>
      {book ? (
        <div className="flex items-center gap-3">
          <Link to={`/books/${book.id}`} className="flex min-w-0 flex-1 items-center gap-3">
            <BookCover book={book} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{book.title}</div>
              {book.author && <div className="truncate text-xs text-muted">{book.author}</div>}
              {book.totalPages ? (
                <>
                  <Progress className="mt-1.5" value={bookProgress(current.read, book.totalPages)} />
                  <div className="mt-1 text-xs text-muted tabular-nums">{current.percent}%</div>
                </>
              ) : null}
            </div>
          </Link>
          <Button variant="secondary" className="min-h-11 shrink-0" onClick={() => void logTwentyMinutes(book.id)}>
            Записать 20 мин
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Сейчас ничего не читаете. <Link to="/books" className="text-accent">Выбрать книгу</Link>
        </p>
      )}
    </Card>
  )
}
