import { useState, type FormEvent } from 'react'
import { Button, Field, Input, Select } from '../../../components/ui'
import { db } from '../../../db'
import type { Book, BookStatus } from '../../../db/types'
import { today } from '../../../lib/dates'
import { newId } from '../../../lib/id'
import { parseTags, STATUS_ORDER, STATUS_RU } from './calc'
import { searchOpenLibrary, type OpenLibraryHit } from './openLibrary'

/** Create or edit a book. Calls `onSaved` with the book id. */
export function BookForm({ book, onSaved }: { book?: Book; onSaved: (id: string) => void }) {
  const [title, setTitle] = useState(book?.title ?? '')
  const [author, setAuthor] = useState(book?.author ?? '')
  const [pages, setPages] = useState(book?.totalPages ? String(book.totalPages) : '')
  const [status, setStatus] = useState<BookStatus>(book?.status ?? 'want')
  const [tags, setTags] = useState(book?.tags?.join(', ') ?? '')
  const [cover, setCover] = useState(book?.coverUrl ?? '')
  const [hits, setHits] = useState<OpenLibraryHit[]>([])
  const [searching, setSearching] = useState(false)

  async function findCover() {
    setSearching(true)
    const found = await searchOpenLibrary(title, author)
    setSearching(false)
    const withCover = found.filter((h) => h.coverUrl)
    setHits(withCover)
    const first = withCover[0] ?? found[0]
    if (!first) return
    if (first.coverUrl && !cover) setCover(first.coverUrl)
    if (first.author && !author.trim()) setAuthor(first.author)
    if (first.pages && !pages) setPages(String(first.pages))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    const total = Number(pages)
    const d = today()
    const fields = {
      title: t,
      author: author.trim() || undefined,
      totalPages: Number.isFinite(total) && total > 0 ? Math.round(total) : undefined,
      status,
      tags: parseTags(tags),
      coverUrl: cover.trim() || undefined,
      startedAt: book?.startedAt ?? (status === 'reading' || status === 'done' ? d : undefined),
      finishedAt: status === 'done' ? (book?.finishedAt ?? d) : undefined,
    }
    if (book) {
      await db.books.update(book.id, fields)
      onSaved(book.id)
    } else {
      const id = newId()
      await db.books.add({ id, ...fields, createdAt: new Date().toISOString() })
      onSaved(id)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Field label="Название">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Атомные привычки" />
      </Field>
      <Field label="Автор">
        <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Джеймс Клир" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Страниц">
          <Input type="number" inputMode="numeric" min={1} value={pages} onChange={(e) => setPages(e.target.value)} />
        </Field>
        <Field label="Статус">
          <Select value={status} onChange={(e) => setStatus(e.target.value as BookStatus)}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_RU[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Теги" hint="Через запятую">
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="саморазвитие, бизнес" />
      </Field>
      <div>
        <Field label="Обложка (URL)">
          <Input type="url" value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://…" />
        </Field>
        <Button variant="secondary" size="sm" className="mt-2" disabled={!title.trim() || searching} onClick={() => void findCover()}>
          {searching ? 'Ищу…' : 'Найти обложку'}
        </Button>
        {hits.length > 0 && (
          <ul className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Найденные обложки">
            {hits.map((h) => (
              <li key={h.coverUrl}>
                <button
                  type="button"
                  aria-label={`Выбрать обложку: ${h.title}`}
                  aria-pressed={cover === h.coverUrl}
                  onClick={() => setCover(h.coverUrl!)}
                  className={`block overflow-hidden rounded-lg border-2 ${cover === h.coverUrl ? 'border-accent' : 'border-transparent'}`}
                >
                  <img src={h.coverUrl} alt="" className="h-24 w-16 object-cover" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={!title.trim()}>
        Сохранить
      </Button>
    </form>
  )
}
