import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { db } from '../../db'
import type { JournalEntry } from '../../db/types'
import { fromISODate } from '../../lib/dates'
import { cleanItems, isJournalKind, JOURNAL_KIND_ICON, JOURNAL_KIND_LABEL, REVIEW_PROMPTS } from './calc'
import { JournalForm } from './JournalForm'
import { linkPrimary } from './styles'

/** `/mind/journal/new?kind=…` creates an entry; `/mind/journal/:id` views, edits or deletes one. */
export function JournalEntryPage() {
  const { id } = useParams()
  if (!id || id === 'new') return <NewEntry />
  return <ExistingEntry key={id} id={id} />
}

function NewEntry() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const kindParam = params.get('kind')
  const kind = isJournalKind(kindParam) ? kindParam : 'free'
  const title = kind === 'gratitude' ? 'Благодарность' : kind === 'evening_review' ? 'Вечерний обзор' : 'Новая запись'
  return (
    <>
      <PageHeader title={title} back="/mind/journal" />
      <JournalForm kind={kind} onSaved={() => navigate('/mind/journal')} />
    </>
  )
}

function ExistingEntry({ id }: { id: string }) {
  const navigate = useNavigate()
  const entry = useLiveQuery(async () => (await db.journal.get(id)) ?? null, [id])
  const [editing, setEditing] = useState(false)

  if (entry === undefined) return <PageHeader title="Запись" back="/mind/journal" />
  if (entry === null) {
    return (
      <>
        <PageHeader title="Запись" back="/mind/journal" />
        <EmptyState
          title="Запись не найдена"
          action={
            <Link to="/mind/journal" className={linkPrimary}>
              К дневнику
            </Link>
          }
        />
      </>
    )
  }

  async function remove() {
    if (!window.confirm('Удалить запись?')) return
    await db.journal.delete(id)
    navigate('/mind/journal', { replace: true })
  }

  const dateLabel = format(fromISODate(entry.date), 'd MMMM yyyy, EEEE', { locale: ru })

  return (
    <>
      <PageHeader title={JOURNAL_KIND_LABEL[entry.kind]} subtitle={dateLabel} back="/mind/journal" />
      {editing ? (
        <JournalForm kind={entry.kind} entry={entry} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <EntryView entry={entry} />
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => setEditing(true)}>
              Изменить
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Удалить
            </Button>
          </div>
        </>
      )}
    </>
  )
}

function EntryView({ entry }: { entry: JournalEntry }) {
  return (
    <Card className="space-y-3">
      <div className="text-3xl" aria-hidden>
        {JOURNAL_KIND_ICON[entry.kind]}
      </div>
      {entry.kind === 'gratitude' && (
        <ol className="list-decimal space-y-1 pl-5">
          {cleanItems(entry.items).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      {entry.kind === 'evening_review' && (
        <dl className="space-y-3">
          {REVIEW_PROMPTS.map((label, i) => (
            <div key={label}>
              <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{entry.items?.[i]?.trim() || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
      {entry.text && <p className="whitespace-pre-wrap">{entry.text}</p>}
      {entry.tags && entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
              #{t}
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}
