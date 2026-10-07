import { useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import {
  Card,
  EmptyState,
  IconBadge,
  LinkButton,
  PageHeader,
  SectionHeader,
  StaggerList,
  type IconName,
  type Tone,
} from '../../components/ui'
import { shiftWeek, weekLabel, weekStartOf } from './calc'
import { StatGrid, Stars } from './components'
import { useCurrencySign, useWeekStats } from './hooks'

export function WeeklyReviewViewPage() {
  const { weekStart: raw = '' } = useParams()
  const week = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? weekStartOf(raw) : raw
  const prevWeek = week ? shiftWeek(week, -1) : ''
  const review = useLiveQuery(
    async () => (await db.weeklyReviews.where('weekStart').equals(week).first()) ?? null,
    [week],
  )
  const prevReview = useLiveQuery(
    async () =>
      prevWeek
        ? ((await db.weeklyReviews.where('weekStart').equals(prevWeek).first()) ?? null)
        : null,
    [prevWeek],
  )
  // Previous week: its saved snapshot when reviewed, otherwise computed live.
  const prevLive = useWeekStats(prevReview === null && prevWeek ? prevWeek : undefined)
  const currency = useCurrencySign()

  if (review === undefined) return <PageHeader title="Обзор недели" back="/goals/review" />
  if (review === null) {
    return (
      <>
        <PageHeader title="Обзор недели" back="/goals/review" />
        <EmptyState
          icon="calendar"
          tone="amber"
          title="Обзор не найден"
          hint={week.length === 10 ? `Неделя ${weekLabel(week)} ещё не подведена.` : undefined}
          action={
            <LinkButton to={`/goals/review${week.length === 10 ? `?week=${week}` : ''}`} icon="edit">
              Подвести итоги
            </LinkButton>
          }
        />
      </>
    )
  }

  const previous = prevReview?.stats ?? prevLive
  const sections: { title: string; icon: IconName; tone: Tone; lines: string[] }[] = [
    { title: 'Победы', icon: 'trophy', tone: 'accent', lines: review.wins },
    { title: 'Улучшить', icon: 'activity', tone: 'warn', lines: review.improve },
    { title: 'Фокус на следующую неделю', icon: 'target', tone: 'info', lines: review.nextFocus },
  ]

  return (
    <>
      <PageHeader
        title={`Неделя ${weekLabel(review.weekStart)}`}
        back="/goals/review"
        action={
          <LinkButton to={`/goals/review?week=${review.weekStart}`} variant="secondary" size="sm" icon="edit">
            Изменить
          </LinkButton>
        }
      />
      <StaggerList className="space-y-3">
        <Card key="rating" variant="elevated" tone="amber" className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5 text-sm font-medium">
            <IconBadge name="star" tone="amber" size="sm" />
            Оценка недели
          </span>
          {review.rating ? (
            <Stars value={review.rating} size={20} />
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </Card>

        {sections.map((sec) => (
          <Card key={sec.title} tone={sec.tone}>
            <h2 className="mb-2.5 flex items-center gap-2 font-semibold tracking-tight">
              <IconBadge name={sec.icon} tone={sec.tone} size="sm" />
              {sec.title}
            </h2>
            {sec.lines.length === 0 ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <ul className="space-y-1.5 text-[15px]">
                {sec.lines.map((l, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-50" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </StaggerList>

      <section aria-label="Цифры недели">
        <SectionHeader title="Цифры недели" icon="chart" tone="accent" />
        <StatGrid current={review.stats} previous={previous} currency={currency} />
      </section>
    </>
  )
}
