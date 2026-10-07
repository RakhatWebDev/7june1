import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, Confetti, Progress, Skeleton, StatTile } from '../../components/ui'
import { Icon } from '../../components/icons'
import { plural } from '../../lib/format'
import { logTwentyMinutes } from './books/actions'
import { BookCover } from './books/BookCover'
import { bookProgress } from './books/calc'
import { useCurrentBook } from './books/hooks'
import { HabitBubble, HabitCheck } from './habits/HabitCheck'
import { useHabitsToday } from './habits/hooks'
import { claimCelebration, setHabitDone } from './habits/meta'

/**
 * Today's habits for the "Сегодня" dashboard: a checklist (`layout="list"`) or a compact
 * row of icon-only round bubbles, 8 per row (`layout="bubbles"`). Checking the last open habit fires confetti once a day.
 */
export function HabitsTodayCard({ layout = 'list' }: { layout?: 'list' | 'bubbles' }) {
  const summary = useHabitsToday()
  const [celebration, setCelebration] = useState(0)
  /** Toggles a habit; checking the last open one fires confetti (once a day). */
  const toggle = (habitId: string, done: boolean) => {
    if (!summary) return
    void setHabitDone(habitId, summary.today, !done)
    if (!done && summary.total > 0 && summary.done + 1 === summary.total && claimCelebration(summary.today))
      setCelebration((n) => n + 1)
  }
  return (
    <Card className="relative" tone="pink">
      {celebration > 0 && <Confetti key={celebration} />}
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Link
          to="/habits"
          className="flex items-center gap-2 font-semibold tracking-tight hover:text-pink"
        >
          <Icon name="check" size={18} className="text-pink" />
          Привычки
        </Link>
        {summary && (
          <span className="text-sm text-muted tabular-nums" data-testid="habits-today-count">
            {summary.done} из {summary.total}
            {summary.streak > 0 && (
              <>
                {' '}
                · <Icon name="flame" size={14} className="inline -mt-0.5 text-amber" />{' '}
                {summary.streak} {plural(summary.streak, ['день', 'дня', 'дней'])}
              </>
            )}
          </span>
        )}
      </div>
      {summary && summary.total === 0 ? (
        <p className="text-sm text-muted">
          Нет активных привычек.{' '}
          <Link to="/habits/new" className="text-accent">
            Добавить
          </Link>
        </p>
      ) : layout === 'bubbles' ? (
        <ul className="grid grid-cols-8 gap-x-1 gap-y-2">
          {summary?.habits.map((h) => {
            const st = summary.status.get(h.id)
            const done = !!st?.done.has(summary.today)
            return (
              <li key={h.id} className="min-w-0">
                <HabitBubble
                  icon={h.icon}
                  name={h.name}
                  color={h.color}
                  done={done}
                  auto={!!st?.auto.has(summary.today)}
                  onToggle={() => toggle(h.id, done)}
                  showLabel={false}
                />
              </li>
            )
          })}
        </ul>
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
                  onToggle={() => toggle(h.id, done)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/** The current book with progress and a quick "+20 min" log for the dashboard. `compact` = 2-column tile. */
export function ReadingTodayCard({ compact = false }: { compact?: boolean }) {
  const current = useCurrentBook()
  if (compact) return <ReadingTile current={current} />
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
                  <Progress
                    className="mt-1.5"
                    value={bookProgress(current.read, book.totalPages)}
                  />
                  <div className="mt-1 text-xs text-muted tabular-nums">{current.percent}%</div>
                </>
              ) : null}
            </div>
          </Link>
          <Button
            variant="secondary"
            className="min-h-11 shrink-0"
            onClick={() => void logTwentyMinutes(book.id)}
          >
            Записать 20 мин
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Сейчас ничего не читаете.{' '}
          <Link to="/books" className="text-accent">
            Выбрать книгу
          </Link>
        </p>
      )}
    </Card>
  )
}

function ReadingTile({ current }: { current: ReturnType<typeof useCurrentBook> }) {
  const book = current?.book
  return (
    <StatTile
      icon="book"
      tone="amber"
      label="Чтение"
      to={book ? `/books/${book.id}` : '/books'}
      value={
        current === undefined ? (
          <Skeleton className="h-6 w-14" />
        ) : book?.totalPages ? (
          `${current.percent}%`
        ) : book ? (
          'Читаю'
        ) : (
          '—'
        )
      }
      sub={book ? book.title : current === undefined ? undefined : 'Выберите книгу'}
      action={
        book ? (
          <button
            type="button"
            aria-label="Записать 20 мин"
            onClick={() => void logTwentyMinutes(book.id)}
            className="flex min-h-8 items-center gap-0.5 rounded-full bg-amber/15 px-2.5 text-xs font-semibold text-amber transition active:scale-95"
          >
            <Icon name="plus" size={14} />
            20 мин
          </button>
        ) : undefined
      }
    />
  )
}
