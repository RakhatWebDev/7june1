import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Button, Card, EmptyState, IconBadge, LinkButton, PageHeader } from '../../components/ui'
import { db } from '../../db'
import type { JournalEntry } from '../../db/types'
import { fromISODate } from '../../lib/dates'
import { cleanItems, isJournalKind, JOURNAL_KIND_LABEL, REVIEW_PROMPTS } from './calc'
import { JournalForm } from './JournalForm'
import { JOURNAL_KIND_BADGE, REVIEW_BADGES } from './styles'

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
          icon="search"
          tone="violet"
          title="Запись не найдена"
          action={
            <LinkButton to="/mind/journal" icon="book">
              К дневнику
            </LinkButton>
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
            <Button className="flex-1" icon="edit" onClick={() => setEditing(true)}>
              Изменить
            </Button>
            <Button variant="danger" icon="trash" onClick={() => void remove()}>
              Удалить
            </Button>
          </div>
        </>
      )}
    </>
  )
}

function EntryView({ entry }: { entry: JournalEntry }) {
  const badge = JOURNAL_KIND_BADGE[entry.kind]
  return (
    <Card variant="elevated" tone={badge.tone} className="space-y-4">
      <IconBadge name={badge.icon} tone={badge.tone} size="lg" />
      {entry.kind === 'gratitude' && (
        <ol className="space-y-2">
          {cleanItems(entry.items).map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-pink/15 text-xs font-semibold text-pink tabular-nums">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      )}
      {entry.kind === 'evening_review' && (
        <dl className="space-y-3">
          {REVIEW_PROMPTS.map((label, i) => (
            <div key={label} className="flex gap-3">
              <IconBadge name={REVIEW_BADGES[i].icon} tone={REVIEW_BADGES[i].tone} size="sm" />
              <div className="min-w-0">
                <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{entry.items?.[i]?.trim() || '—'}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}
      {entry.text && <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{entry.text}</p>}
      {entry.tags && entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((t) => (
            <span key={t} className="rounded-full bg-surface-3/70 px-2 py-0.5 text-xs text-muted">
              #{t}
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}
