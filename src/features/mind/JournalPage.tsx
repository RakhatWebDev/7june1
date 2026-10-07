import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useSearchParams } from 'react-router'
import { Chip, EmptyState, Input, PageHeader } from '../../components/ui'
import { db } from '../../db'
import { ddmm, isJournalKind, JOURNAL_KIND_ICON, JOURNAL_KIND_LABEL, journalPreview, searchJournal, type JournalFilter } from './calc'
import { linkPrimary, linkSecondary } from './styles'

const FILTERS: { value: JournalFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'gratitude', label: JOURNAL_KIND_LABEL.gratitude },
  { value: 'reflection', label: JOURNAL_KIND_LABEL.reflection },
  { value: 'evening_review', label: JOURNAL_KIND_LABEL.evening_review },
  { value: 'free', label: 'Свободные' },
]

/** Journal feed with a kind filter and full-text search. */
export function JournalPage() {
  const [params, setParams] = useSearchParams()
  const kindParam = params.get('kind')
  const filter: JournalFilter = isJournalKind(kindParam) ? kindParam : 'all'
  const [query, setQuery] = useState('')
  const entries = useLiveQuery(() => db.journal.toArray(), [])
  const list = searchJournal(entries ?? [], query, filter)

  return (
    <>
      <PageHeader
        title="Дневник"
        back="/mind"
        action={
          <Link to="/mind/journal/new?kind=free" className={linkPrimary}>
            + Запись
          </Link>
        }
      />

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Link to="/mind/journal/new?kind=gratitude" className={linkSecondary}>
          💛 Благодарность
        </Link>
        <Link to="/mind/review" className={linkSecondary}>
          🌙 Вечерний обзор
        </Link>
      </div>

      <Input
        type="search"
        aria-label="Поиск по записям"
        placeholder="Поиск по тексту и тегам"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3"
      />
      <div role="group" aria-label="Тип записей" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            active={filter === f.value}
            onClick={() => setParams(f.value === 'all' ? {} : { kind: f.value }, { replace: true })}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      {entries === undefined ? null : entries.length === 0 ? (
        <EmptyState
          title="Дневник пока пуст"
          hint="Начните с трёх вещей, за которые вы благодарны сегодня — это занимает минуту."
          action={
            <Link to="/mind/journal/new?kind=gratitude" className={linkPrimary}>
              Записать благодарность
            </Link>
          }
        />
      ) : list.length === 0 ? (
        <EmptyState title="Ничего не найдено" hint="Измените запрос или фильтр." />
      ) : (
        <ul className="space-y-2" aria-label="Записи дневника">
          {list.map((e) => (
            <li key={e.id}>
              <Link
                to={`/mind/journal/${e.id}`}
                className="block rounded-2xl border border-border bg-surface p-3 transition hover:border-accent/50"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    <span aria-hidden>{JOURNAL_KIND_ICON[e.kind]}</span> {JOURNAL_KIND_LABEL[e.kind]}
                  </span>
                  <span className="tabular-nums">{ddmm(e.date)}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-sm">{journalPreview(e) || '—'}</p>
                {e.tags && e.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {e.tags.map((t) => (
                      <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
