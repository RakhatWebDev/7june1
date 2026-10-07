import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { Chip, EmptyState, Icon, IconBadge, Input, LinkButton, PageHeader } from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import { db } from '../../db'
import { ddmm, isJournalKind, JOURNAL_KIND_LABEL, journalPreview, searchJournal, type JournalFilter } from './calc'
import { JOURNAL_KIND_BADGE, staggerItem } from './styles'

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
  const reduce = useReduceMotion()

  return (
    <>
      <PageHeader
        title="Дневник"
        back="/mind"
        action={
          <LinkButton to="/mind/journal/new?kind=free" size="sm" icon="plus">
            Запись
          </LinkButton>
        }
      />

      <div className="mb-3 grid grid-cols-2 gap-2">
        <QuickLink to="/mind/journal/new?kind=gratitude" kind="gratitude" label="Благодарность" />
        <QuickLink to="/mind/review" kind="evening_review" label="Вечерний обзор" />
      </div>

      <div className="relative mb-3">
        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          aria-label="Поиск по записям"
          placeholder="Поиск по тексту и тегам"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>
      <div role="group" aria-label="Тип записей" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            tone={f.value === 'all' ? 'violet' : JOURNAL_KIND_BADGE[f.value].tone}
            icon={f.value === 'all' ? undefined : JOURNAL_KIND_BADGE[f.value].icon}
            active={filter === f.value}
            onClick={() => setParams(f.value === 'all' ? {} : { kind: f.value }, { replace: true })}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      {entries === undefined ? null : entries.length === 0 ? (
        <EmptyState
          icon="book"
          tone="violet"
          title="Дневник пока пуст"
          hint="Начните с трёх вещей, за которые вы благодарны сегодня — это занимает минуту."
          action={
            <LinkButton to="/mind/journal/new?kind=gratitude" icon="heart">
              Записать благодарность
            </LinkButton>
          }
        />
      ) : list.length === 0 ? (
        <EmptyState icon="search" tone="muted" title="Ничего не найдено" hint="Измените запрос или фильтр." />
      ) : (
        <ul className="space-y-2.5" aria-label="Записи дневника">
          {list.map((e, i) => {
            const badge = JOURNAL_KIND_BADGE[e.kind]
            return (
              <motion.li key={e.id} {...staggerItem(i, reduce)}>
                <Link
                  to={`/mind/journal/${e.id}`}
                  className="flex gap-3 rounded-3xl border border-white/[0.06] bg-surface bg-[image:var(--gradient-surface)] p-3.5 shadow-[var(--shadow-card)] transition-[border-color,transform] duration-150 hover:border-white/15 active:scale-[0.99] motion-reduce:active:scale-100"
                >
                  <IconBadge name={badge.icon} tone={badge.tone} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted">
                      <span className="font-medium">{JOURNAL_KIND_LABEL[e.kind]}</span>
                      <span className="tabular-nums">{ddmm(e.date)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-3 text-[15px] leading-snug">{journalPreview(e) || '—'}</p>
                    {e.tags && e.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {e.tags.map((t) => (
                          <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              </motion.li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function QuickLink({ to, kind, label }: { to: string; kind: keyof typeof JOURNAL_KIND_BADGE; label: string }) {
  const badge = JOURNAL_KIND_BADGE[kind]
  return (
    <Link
      to={to}
      className="flex min-h-14 items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-surface-2/70 px-3 py-2 text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-surface-2 active:scale-[0.98] motion-reduce:active:scale-100"
    >
      <IconBadge name={badge.icon} tone={badge.tone} size="sm" />
      <span className="min-w-0 leading-tight">{label}</span>
    </Link>
  )
}
