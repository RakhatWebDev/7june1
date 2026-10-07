import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { Card, EmptyState, PageHeader } from '../../components/ui'
import { shiftWeek, weekLabel, weekStartOf } from './calc'
import { StatGrid, Stars } from './components'
import { useCurrencySign, useWeekStats } from './hooks'
import { LINK_PRIMARY, LINK_SECONDARY } from './styles'

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
          title="Обзор не найден"
          hint={week.length === 10 ? `Неделя ${weekLabel(week)} ещё не подведена.` : undefined}
          action={
            <Link
              to={`/goals/review${week.length === 10 ? `?week=${week}` : ''}`}
              className={LINK_PRIMARY}
            >
              Подвести итоги
            </Link>
          }
        />
      </>
    )
  }

  const previous = prevReview?.stats ?? prevLive
  const sections: [string, string[]][] = [
    ['Победы', review.wins],
    ['Улучшить', review.improve],
    ['Фокус на следующую неделю', review.nextFocus],
  ]

  return (
    <>
      <PageHeader
        title={`Неделя ${weekLabel(review.weekStart)}`}
        back="/goals/review"
        action={
          <Link to={`/goals/review?week=${review.weekStart}`} className={LINK_SECONDARY}>
            Изменить
          </Link>
        }
      />
      <div className="space-y-4">
        <Card className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Оценка недели</span>
          {review.rating ? (
            <Stars value={review.rating} className="text-xl" />
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </Card>

        {sections.map(([title, lines]) => (
          <Card key={title}>
            <h2 className="mb-2 font-semibold">{title}</h2>
            {lines.length === 0 ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}

        <section>
          <h2 className="mb-2 font-semibold">Цифры недели</h2>
          <StatGrid current={review.stats} previous={previous} currency={currency} />
        </section>
      </div>
    </>
  )
}
