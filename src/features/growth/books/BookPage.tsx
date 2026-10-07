import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Progress,
  SectionHeader,
  Sheet,
  StaggerList,
  Stepper,
  Toast,
} from '../../../components/ui'
import { useReduceMotion } from '../../../components/ui/helpers'
import { db } from '../../../db'
import type { Book, ReadingLog } from '../../../db/types'
import { today } from '../../../lib/dates'
import { ddmm } from '../shared'
import { logReading, logTwentyMinutes } from './actions'
import { BookCover } from './BookCover'
import { BookForm } from './BookForm'
import { bookProgress, pagesRead, progressPercent, STATUS_RU } from './calc'

const textareaClass =
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-base text-text placeholder:text-muted/70 transition-[border-color,box-shadow] focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/20'

export function BookPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const book = useLiveQuery(async () => (await db.books.get(id)) ?? null, [id])
  const logs = useLiveQuery(() => db.readingLogs.where('bookId').equals(id).toArray(), [id])
  const [logOpen, setLogOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [finishedToast, setFinishedToast] = useState(false)

  if (book === undefined) return null
  if (book === null) {
    return (
      <>
        <PageHeader title="Книга" back="/books" />
        <EmptyState icon="book" tone="amber" title="Книга не найдена" />
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
          <Button variant="secondary" size="sm" icon="edit" onClick={() => setEditOpen(true)}>
            Изменить
          </Button>
        }
      />

      <Card variant="elevated" tone="amber" className="mb-3">
        <div className="flex gap-4">
          <BookCover book={book} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full bg-amber/15 px-2.5 py-0.5 font-medium text-amber">{STATUS_RU[book.status]}</span>
              {book.tags?.map((t) => (
                <span key={t} className="rounded-full border border-white/[0.08] bg-surface-2/60 px-2.5 py-0.5 text-muted">
                  {t}
                </span>
              ))}
            </div>
            {book.rating && (
              <div className="mb-2 flex gap-0.5 text-amber" role="img" aria-label={`Оценка ${book.rating} из 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Icon
                    key={n}
                    name="star"
                    size={16}
                    fill={n <= book.rating! ? 'currentColor' : 'none'}
                    className={n <= book.rating! ? '' : 'text-surface-3'}
                  />
                ))}
              </div>
            )}
            <div className="text-sm text-muted tabular-nums" data-testid="book-progress">
              {book.totalPages
                ? `Страница ${Math.min(read, book.totalPages)} из ${book.totalPages} · ${progressPercent(read, book.totalPages)}%`
                : `Прочитано ${read} стр.`}
            </div>
            {book.totalPages ? <Progress className="mt-2" tone="amber" value={bookProgress(read, book.totalPages)} /> : null}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button className="min-h-11 flex-1" icon="edit" onClick={() => setLogOpen(true)}>
            Записать чтение
          </Button>
          <Button variant="secondary" className="min-h-11" icon="plus" onClick={() => void logTwentyMinutes(book.id)}>
            20 мин
          </Button>
        </div>
      </Card>

      {finishedReading && <FinishCard key={book.id} book={book} onFinished={() => setFinishedToast(true)} />}

      {book.status === 'done' && book.notes && (
        <Card className="mb-3">
          <h2 className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
            <Icon name="trophy" size={14} className="text-amber" />
            Итог
          </h2>
          <p className="text-sm whitespace-pre-line">{book.notes}</p>
        </Card>
      )}

      {thoughts.length > 0 && (
        <section aria-label="Мысли из книги" className="mb-2">
          <SectionHeader title="Мысли из книги" icon="sparkles" tone="amber" className="mt-4" />
          <StaggerList as="ul" className="space-y-2">
            {thoughts.map((l) => (
              <figure
                key={l.id}
                className="relative overflow-hidden rounded-3xl border border-amber/20 bg-surface bg-[image:var(--gradient-surface)] p-4 pl-11"
              >
                <span
                  aria-hidden
                  className="absolute top-1 left-3 font-serif text-5xl leading-none text-amber/70 select-none"
                >
                  “
                </span>
                <blockquote className="text-[15px] leading-relaxed whitespace-pre-line">{l.note}</blockquote>
                <figcaption className="mt-2 text-xs text-muted tabular-nums">{ddmm(l.date)}</figcaption>
              </figure>
            ))}
          </StaggerList>
        </section>
      )}

      <section aria-label="Сессии чтения">
        <SectionHeader title="Сессии чтения" icon="history" tone="amber" className="mt-4" />
        {sessions.length === 0 ? (
          <EmptyState icon="timer" tone="amber" title="Пока нет записей" hint="Записывайте страницы и минуты после каждой сессии." />
        ) : (
          <Card className="p-1.5">
            <StaggerList as="ul" className="divide-y divide-white/[0.05]">
              {sessions.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-2.5 py-2" data-testid="reading-log">
                  <span className="grid w-12 shrink-0 place-items-center rounded-xl bg-amber/10 py-1 text-xs font-semibold text-amber tabular-nums">
                    {ddmm(l.date)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium tabular-nums">
                      {[l.pages ? `${l.pages} стр.` : null, l.minutes ? `${l.minutes} мин` : null].filter(Boolean).join(' · ') || '—'}
                    </span>
                    {l.note && <span className="block truncate text-xs text-muted">{l.note}</span>}
                  </span>
                  <button
                    type="button"
                    aria-label="Удалить запись"
                    className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    onClick={() => void removeLog(l)}
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              ))}
            </StaggerList>
          </Card>
        )}
      </section>

      {logOpen && <LogSheet bookId={book.id} onClose={() => setLogOpen(false)} />}

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Редактировать книгу">
        {editOpen && <BookForm book={book} onSaved={() => setEditOpen(false)} />}
        <Button variant="danger" icon="trash" className="mt-3 w-full" onClick={() => void removeBook()}>
          Удалить книгу
        </Button>
      </Sheet>

      <Toast open={finishedToast} icon="book" tone="amber" onClose={() => setFinishedToast(false)}>
        Книга прочитана
      </Toast>
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
          <Button variant="secondary" className="flex-1" onClick={onClose}>
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

function FinishCard({ book, onFinished }: { book: Book; onFinished: () => void }) {
  const reduce = useReduceMotion()
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
    onFinished()
  }

  return (
    <Card variant="accent" tone="amber" className="mb-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Icon name="trophy" size={20} className="text-amber" />
        Книга дочитана!
      </h2>
      <p className="mb-3 text-sm text-muted">Отметить «Прочитано»? Оцените книгу и запишите главное.</p>
      <div className="mb-3 flex gap-1" role="radiogroup" aria-label="Оценка">
        {([1, 2, 3, 4, 5] as const).map((n) => {
          const on = !!rating && n <= rating
          return (
            <motion.button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`Оценка ${n}`}
              onClick={() => setRating(n)}
              whileTap={reduce ? undefined : { scale: 0.8 }}
              animate={reduce ? undefined : { scale: on ? 1.12 : 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 14, delay: on ? (n - 1) * 0.04 : 0 }}
              className={`grid size-11 place-items-center rounded-xl transition-colors ${on ? 'text-amber' : 'text-surface-3 hover:text-muted'}`}
            >
              <Icon name="star" size={28} fill={on ? 'currentColor' : 'none'} strokeWidth={on ? 1.5 : 1.75} />
            </motion.button>
          )
        })}
      </div>
      <Field label="Итоговая заметка">
        <textarea className={textareaClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Главные выводы" />
      </Field>
      <Button className="mt-3 w-full" icon="check" onClick={() => void finish()}>
        Отметить «Прочитано»
      </Button>
    </Card>
  )
}
