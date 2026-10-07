import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { Card, EmptyState, LinkButton, PageHeader, Stat } from '../../components/ui'
import { WorkoutsNav } from '../../components/WorkoutsNav'
import { db } from '../../db'
import type { ActivityType } from '../../db/types'
import { formatMinutes, weekDates } from '../../lib/dates'
import { int, km } from '../../lib/format'
import { ActivityItem } from './ActivityItem'
import { ACTIVITY_ICON, ACTIVITY_RU, ACTIVITY_TYPES, summarize } from './calc'

const QUICK: { type: ActivityType; label: string }[] = [
  { type: 'run', label: 'Бег' },
  { type: 'bike', label: 'Вело' },
  { type: 'swim', label: 'Бассейн' },
  { type: 'rope', label: 'Скакалка' },
  { type: 'walk', label: 'Ходьба' },
  { type: 'stretch', label: 'Растяжка' },
]

export function CardioPage() {
  const week = weekDates()
  const from = week[0]
  const to = week[6]
  const weekActivities = useLiveQuery(
    () => db.activities.where('date').between(from, to, true, true).toArray(),
    [from, to],
  )
  const recent = useLiveQuery(() => db.activities.orderBy('date').reverse().limit(30).toArray(), [])
  const summary = summarize(weekActivities ?? [], from, to)

  async function remove(id: string) {
    if (!window.confirm('Удалить активность?')) return
    await db.activities.delete(id)
  }

  return (
    <>
      <PageHeader
        title="Кардио"
        subtitle="Бег, вело, бассейн и другие активности"
        action={
          <LinkButton to="/cardio/new" size="sm" icon="plus">
            Добавить
          </LinkButton>
        }
      />
      <WorkoutsNav />

      <section aria-label="Эта неделя" className="mb-4">
        <h2 className="mb-2 text-sm font-medium text-muted">Эта неделя</h2>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Минуты" value={int(summary.minutes)} />
          <Stat label="Дистанция" value={summary.km ? km(summary.km) : '—'} />
          <Stat label="Сессии" value={summary.count} />
        </div>
        {summary.count > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="По типам">
            {ACTIVITY_TYPES.filter((t) => summary.byType[t]).map((t) => {
              const s = summary.byType[t]!
              return (
                <li key={t} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-muted">
                  <span aria-hidden>{ACTIVITY_ICON[t]}</span> {ACTIVITY_RU[t]}: {s.count} · {formatMinutes(s.minutes)}
                  {s.km > 0 && ` · ${km(s.km)}`}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-label="Быстрое добавление" className="mb-4 grid grid-cols-3 gap-2">
        {QUICK.map((q) => (
          <Link
            key={q.type}
            to={`/cardio/new?type=${q.type}`}
            className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface px-2 py-3 text-sm hover:border-accent"
          >
            <span aria-hidden className="text-xl">
              {ACTIVITY_ICON[q.type]}
            </span>
            + {q.label}
          </Link>
        ))}
      </section>

      <Link to="/cardio/stretch" className="mb-6 block">
        <Card className="flex items-center justify-between gap-3 hover:border-accent">
          <div>
            <div className="font-semibold">Комплексы растяжки</div>
            <div className="text-sm text-muted">После ног, после верха, утренняя мобилити — с таймером</div>
          </div>
          <span aria-hidden className="text-accent">
            →
          </span>
        </Card>
      </Link>

      <h2 className="mb-2 text-sm font-medium text-muted">Последние активности</h2>
      {recent && recent.length === 0 ? (
        <EmptyState title="Пока нет активностей" hint="Добавьте пробежку, заплыв или растяжку кнопками выше." />
      ) : (
        <ul className="space-y-2">
          {(recent ?? []).map((a) => (
            <ActivityItem key={a.id} activity={a} onDelete={() => void remove(a.id)} />
          ))}
        </ul>
      )}
    </>
  )
}
