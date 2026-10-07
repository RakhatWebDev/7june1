import { useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { Card, Progress } from '../../components/ui'
import { Icon } from '../../components/icons'
import { areaMeta } from './areas'
import {
  goalProgress,
  isReviewDay,
  krSummary,
  reviewTargetWeek,
  shiftWeek,
  weekLabel,
  weekStartOf,
} from './calc'
import { Stars } from './components'
import { LINK_PRIMARY } from './styles'

/** Up to three active goals with KR progress, for the "Сегодня" dashboard. */
export function GoalsFocusCard() {
  const goals = useLiveQuery(() => db.lifeGoals.where('status').equals('active').sortBy('sort'), [])
  const top = (goals ?? []).slice(0, 3)
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Link to="/goals" className="flex items-center gap-2 font-semibold tracking-tight hover:text-accent">
          <Icon name="target" size={18} className="text-accent" />
          Цели
        </Link>
        {goals && goals.length > 3 && (
          <span className="text-xs text-muted">ещё {goals.length - 3}</span>
        )}
      </div>
      {goals && goals.length === 0 ? (
        <p className="text-sm text-muted">
          Активных целей нет.{' '}
          <Link to="/goals/new" className="text-accent">
            Поставить цель
          </Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {top.map((g) => {
            const pct = Math.round(goalProgress(g))
            const kr = g.keyResults[0]
            return (
              <li key={g.id}>
                <Link to={`/goals/${g.id}`} className="block">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">
                      <span aria-hidden className="mr-1.5">
                        {areaMeta(g.area).icon}
                      </span>
                      {g.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">{pct}%</span>
                  </div>
                  <Progress value={pct / 100} className="mt-1.5" />
                  {kr && <div className="mt-1 truncate text-xs text-muted">{krSummary(kr)}</div>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/**
 * On Sunday / Monday: a call to review the finished week. On other days: the
 * rating and focus of last week's review (or a nudge to fill it in).
 */
export function WeeklyReviewCard({ now }: { now?: Date }) {
  const [mountedAt] = useState(() => new Date())
  const date = now ?? mountedAt
  const reviewDay = isReviewDay(date)
  const week = reviewDay ? reviewTargetWeek(date) : shiftWeek(weekStartOf(date), -1)
  const review = useLiveQuery(
    async () => (await db.weeklyReviews.where('weekStart').equals(week).first()) ?? null,
    [week],
  )
  if (review === undefined) return null

  if (review === null) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">
              {reviewDay ? 'Подвести итоги недели' : 'Обзор прошлой недели'}
            </div>
            <div className="text-xs text-muted">
              {reviewDay ? `Неделя ${weekLabel(week)}` : `${weekLabel(week)} · ещё не заполнен`}
            </div>
          </div>
          <Link to={`/goals/review?week=${week}`} className={`${LINK_PRIMARY} shrink-0`}>
            {reviewDay ? 'Начать' : 'Заполнить'}
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <Link to={`/goals/review/${week}`} className="block">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">
            {reviewDay ? 'Итоги недели подведены' : 'Прошлая неделя'}
          </span>
          <Stars value={review.rating} />
        </div>
        <div className="text-xs text-muted">{weekLabel(week)}</div>
        {review.nextFocus.length > 0 && (
          <p className="mt-2 text-sm">
            <span className="text-muted">Фокус: </span>
            {review.nextFocus.join(' · ')}
          </p>
        )}
      </Link>
    </Card>
  )
}
