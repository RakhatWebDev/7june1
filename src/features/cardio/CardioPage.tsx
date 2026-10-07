import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import {
  Card,
  EmptyState,
  IconBadge,
  LinkButton,
  PageHeader,
  SectionHeader,
  StaggerList,
  StatTile,
} from '../../components/ui'
import { Icon } from '../../components/icons'
import { WorkoutsNav } from '../../components/WorkoutsNav'
import { db } from '../../db'
import type { ActivityType } from '../../db/types'
import { formatMinutes, weekDates } from '../../lib/dates'
import { int, km, plural } from '../../lib/format'
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

      <section aria-label="Эта неделя">
        <SectionHeader
          title="Эта неделя"
          icon="activity"
          tone="info"
          className="mt-0"
          action={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-info/15 px-2.5 py-1 text-xs font-medium text-info tabular-nums">
              <Icon name="flame" size={14} />
              <span className="font-semibold">{summary.count}</span>
              {plural(summary.count, ['занятие', 'занятия', 'занятий'])}
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <StatTile icon="timer" tone="info" label="Время" value={int(summary.minutes)} unit="мин" />
          <StatTile icon="run" tone="info" label="Дистанция" value={summary.km ? km(summary.km) : '—'} />
        </div>
        {summary.count > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5 text-xs" aria-label="По типам">
            {ACTIVITY_TYPES.filter((t) => summary.byType[t]).map((t) => {
              const s = summary.byType[t]!
              return (
                <li
                  key={t}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.06] bg-surface-2 py-1 pr-3 pl-1.5 text-muted tabular-nums"
                >
                  <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-info/15 text-info">
                    <Icon name={ACTIVITY_ICON[t]} size={12} />
                  </span>
                  <span className="truncate">
                    {ACTIVITY_RU[t]}: {s.count} · {formatMinutes(s.minutes)}
                    {s.km > 0 && ` · ${km(s.km)}`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <SectionHeader title="Быстрое добавление" icon="plus" tone="info" />
      <StaggerList className="grid grid-cols-3 gap-2" stagger={0.03}>
        {QUICK.map((q) => (
          <Link
            key={q.type}
            to={`/cardio/new?type=${q.type}`}
            aria-label={`Добавить: ${q.label}`}
            className="group flex h-full flex-col items-center gap-2 rounded-3xl border border-white/[0.06] bg-surface bg-[image:var(--gradient-surface)] px-2 pt-3 pb-2.5 text-[13px] font-medium shadow-[var(--shadow-card)] transition-[border-color,transform] duration-150 hover:border-info/40 active:scale-[0.97] motion-reduce:active:scale-100"
          >
            <IconBadge name={ACTIVITY_ICON[q.type]} tone="info" className="transition-transform group-hover:scale-105" />
            <span className="truncate">{q.label}</span>
          </Link>
        ))}
      </StaggerList>

      <Link to="/cardio/stretch" className="group mt-3 block">
        <Card tone="violet" className="flex items-center gap-3 p-3.5 transition-[border-color] hover:border-violet/40">
          <IconBadge name="stretch" tone="violet" size="lg" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold tracking-tight">Комплексы растяжки</div>
            <div className="text-sm text-muted">После ног, после верха, утренняя мобилити — с таймером</div>
          </div>
          <Icon
            name="chevron-right"
            size={20}
            className="shrink-0 text-muted transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-violet"
          />
        </Card>
      </Link>

      <SectionHeader title="Последние активности" icon="history" tone="info" />
      {recent && recent.length === 0 ? (
        <EmptyState
          icon="run"
          tone="info"
          title="Пока нет активностей"
          hint="Добавьте пробежку, заплыв или растяжку кнопками выше."
        />
      ) : (
        <StaggerList as="ul" className="space-y-2">
          {(recent ?? []).map((a) => (
            <ActivityItem key={a.id} activity={a} onDelete={() => void remove(a.id)} />
          ))}
        </StaggerList>
      )}
    </>
  )
}
