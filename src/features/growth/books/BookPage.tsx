import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router'
import { Button, Card, EmptyState, Field, Input, PageHeader, Progress, Sheet, Stepper } from '../../../components/ui'
import { db } from '../../../db'
import type { Book, ReadingLog } from '../../../db/types'
import { today } from '../../../lib/dates'
import { ddmm } from '../shared'
import { logReading, logTwentyMinutes } from './actions'
import { BookCover } from './BookCover'
import { BookForm } from './BookForm'
import { bookProgress, pagesRead, progressPercent, STATUS_RU } from './calc'

const textareaClass =
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none'

export function BookPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const book = useLiveQuery(async () => (await db.books.get(id)) ?? null, [id])
  const logs = useLiveQuery(() => db.readingLogs.where('bookId').equals(id).toArray(), [id])
  const [logOpen, setLogOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  if (book === undefined) return null
  if (book === null) {
    return (
      <>
        <PageHeader title="Книга" back="/books" />
        <EmptyState title="Книга не найдена" />
      </>
    )
  }

  const sessions = [...(logs ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const read = pagesRead(sessions)
  const thoughts = sessions.filter((l) => l.note)
  const finishedReading = !!book.totalPages && read >= book.totalPages && book.status !== 'done'

  async function removeBook() {
    if (!window.confirm(`Удалить книгу «${book!.title}» и все записи чтения?`)) return
    await db.transaction('rw', db.books, db.readingLogs, async () => {
      await db.readingLogs.where('bookId').equals(id).delete()
      await db.books.delete(id)
    })
    navigate('/books', { replace: true })
  }

  async function removeLog(l: ReadingLog) {
    if (!window.confirm('Удалить запись чтения?')) return
    await db.readingLogs.delete(l.id)
  }

  return (
    <>
      <PageHeader
        title={book.title}
        subtitle={book.author}
        back="/books"
        action={
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            Изменить
          </Button>
        }
      />

      <Card className="mb-3">
        <div className="flex gap-4">
          <BookCover book={book} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-text">{STATUS_RU[book.status]}</span>
              {book.tags?.map((t) => (
                <span key={t} className="rounded-full border border-border px-2 py-0.5 text-muted">
                  {t}
                </span>
              ))}
            </div>
            {book.rating && (
              <div className="mb-2 text-warn" aria-label={`Оценка ${book.rating} из 5`}>
                {'★'.repeat(book.rating)}
                <span className="text-border">{'★'.repeat(5 - book.rating)}</span>
              </div>
            )}
            <div className="text-sm text-muted tabular-nums" data-testid="book-progress">
              {book.totalPages
                ? `Страница ${Math.min(read, book.totalPages)} из ${book.totalPages} · ${progressPercent(read, book.totalPages)}%`
                : `Прочитано ${read} стр.`}
            </div>
            {book.totalPages ? <Progress className="mt-2" value={bookProgress(read, book.totalPages)} /> : null}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button className="min-h-11 flex-1" onClick={() => setLogOpen(true)}>
            + Записать чтение
          </Button>
          <Button variant="secondary" className="min-h-11" onClick={() => void logTwentyMinutes(book.id)}>
            + 20 мин
          </Button>
        </div>
      </Card>

      {finishedReading && <FinishCard key={book.id} book={book} />}

      {book.status === 'done' && book.notes && (
        <Card className="mb-3">
          <h2 className="mb-1 text-sm font-medium text-muted">Итог</h2>
          <p className="text-sm whitespace-pre-line">{book.notes}</p>
        </Card>
      )}

      {thoughts.length > 0 && (
        <section aria-label="Мысли из книги" className="mb-4">
          <h2 className="mb-2 text-sm font-medium text-muted">Мысли из книги</h2>
          <ul className="space-y-2">
            {thoughts.map((l) => (
              <li key={l.id}>
                <blockquote className="rounded-2xl border-l-4 border-warn bg-surface p-3 text-sm whitespace-pre-line">
                  {l.note}
                  <footer className="mt-1 text-xs text-muted">{ddmm(l.date)}</footer>
                </blockquote>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Сессии чтения">
        <h2 className="mb-2 text-sm font-medium text-muted">Сессии чтения</h2>
        {sessions.length === 0 ? (
          <EmptyState title="Пока нет записей" hint="Записывайте страницы и минуты после каждой сессии." />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {sessions.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2.5" data-testid="reading-log">
                <span className="w-12 shrink-0 text-sm text-muted tabular-nums">{ddmm(l.date)}</span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="tabular-nums">
                    {[l.pages ? `${l.pages} стр.` : null, l.minutes ? `${l.minutes} мин` : null].filter(Boolean).join(' · ') || '—'}
                  </span>
                  {l.note && <span className="block truncate text-xs text-muted">{l.note}</span>}
                </span>
                <button
                  type="button"
                  aria-label="Удалить запись"
                  className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
                  onClick={() => void removeLog(l)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {logOpen && <LogSheet bookId={book.id} onClose={() => setLogOpen(false)} />}

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Редактировать книгу">
        {editOpen && <BookForm book={book} onSaved={() => setEditOpen(false)} />}
        <Button variant="danger" className="mt-3 w-full" onClick={() => void removeBook()}>
          Удалить книгу
        </Button>
      </Sheet>
    </>
  )
}

function LogSheet({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const [date, setDate] = useState(today())
  const [pages, setPages] = useState<number | null>(10)
  const [minutes, setMinutes] = useState<number | null>(20)
  const [note, setNote] = useState('')

  async function save() {
    await logReading(bookId, { date, pages: pages ?? 0, minutes: minutes ?? undefined, note })
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title="Сессия чтения">
      <div className="space-y-4">
        <Field label="Дата">
          <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-xs font-medium tracking-wide text-muted uppercase">Страницы</span>
            <Stepper aria-label="Страницы" value={pages} onChange={setPages} step={1} min={0} max={5000} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium tracking-wide text-muted uppercase">Минуты</span>
            <Stepper aria-label="Минуты" value={minutes} onChange={setMinutes} step={5} min={0} max={1440} />
          </div>
        </div>
        <Field label="Заметка или цитата">
          <textarea className={textareaClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Мысль, которую хочется запомнить" />
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Отмена
          </Button>
          <Button className="flex-1" disabled={!pages && !minutes} onClick={() => void save()}>
            Сохранить
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function FinishCard({ book }: { book: Book }) {
  const [rating, setRating] = useState<Book['rating']>(book.rating)
  const [notes, setNotes] = useState(book.notes ?? '')

  async function finish() {
    await db.books.update(book.id, {
      status: 'done',
      finishedAt: today(),
      startedAt: book.startedAt ?? today(),
      rating,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <Card className="mb-3 border-accent/50">
      <h2 className="font-semibold">Книга дочитана! 🎉</h2>
      <p className="mb-3 text-sm text-muted">Отметить «Прочитано»? Оцените книгу и запишите главное.</p>
      <div className="mb-3 flex gap-1" role="radiogroup" aria-label="Оценка">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`Оценка ${n}`}
            onClick={() => setRating(n)}
            className={`grid size-11 place-items-center rounded-xl text-2xl transition-transform active:scale-90 ${
              rating && n <= rating ? 'text-warn' : 'text-border'
            }`}
          >
            ★
          </button>
        ))}
      </div>
      <Field label="Итоговая заметка">
        <textarea className={textareaClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Главные выводы" />
      </Field>
      <Button className="mt-3 w-full" onClick={() => void finish()}>
        Отметить «Прочитано»
      </Button>
    </Card>
  )
}
