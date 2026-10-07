import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import { db } from '../../db'
import type { LifeGoal } from '../../db/types'
import { Card, Chip, EmptyState, PageHeader } from '../../components/ui'
import { LIFE_AREAS } from './areas'
import { reviewTargetWeek, weekLabel, wheelValues } from './calc'
import { GoalRow, Stars } from './components'
import { ensureGoalsSeeded } from './seed'
import { AXIS_TICK, GRID_STROKE, LINK_PRIMARY, SERIES } from './styles'

type Filter = 'active' | 'done'

const inFilter = (g: LifeGoal, f: Filter) =>
  f === 'active' ? g.status === 'active' || g.status === 'paused' : g.status === 'done' || g.status === 'dropped'

export function GoalsPage() {
  useEffect(() => {
    void ensureGoalsSeeded()
  }, [])
  const goals = useLiveQuery(() => db.lifeGoals.orderBy('sort').toArray(), [])
  const reviewWeek = reviewTargetWeek()
  const review = useLiveQuery(() => db.weeklyReviews.where('weekStart').equals(reviewWeek).first(), [reviewWeek])
  const [filter, setFilter] = useState<Filter>('active')

  const wheel = wheelValues(goals ?? [])
  const chartData = wheel.map((w) => ({ ...w, label: `${w.icon} ${w.short}` }))
  const visible = (goals ?? []).filter((g) => inFilter(g, filter))

  return (
    <>
      <PageHeader
        title="Цели"
        subtitle="Сферы жизни и ключевые результаты"
        back="/growth"
        action={
          <Link to="/goals/new" className={LINK_PRIMARY}>
            + Цель
          </Link>
        }
      />

      <div className="space-y-4">
        <Card>
          <h2 className="font-semibold">Колесо баланса</h2>
          <p className="text-xs text-muted">Средний прогресс ключевых результатов активных целей по сферам</p>
          <div className="h-64 w-full" data-testid="balance-wheel">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData} outerRadius="68%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                <PolarGrid stroke={GRID_STROKE} />
                <PolarAngleAxis dataKey="label" tick={AXIS_TICK} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
                <Radar
                  name="Прогресс"
                  dataKey="value"
                  stroke={SERIES}
                  fill={SERIES}
                  fillOpacity={0.25}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4" aria-label="Баланс по сферам">
            {wheel.map((w) => (
              <li key={w.area} className="flex items-center justify-between gap-2">
                <span className="truncate text-muted">
                  <span aria-hidden>{w.icon}</span> {w.name}
                </span>
                <span className={`tabular-nums ${w.goals > 0 ? 'font-medium text-text' : 'text-muted'}`}>{w.value}%</span>
              </li>
            ))}
          </ul>
        </Card>

        <Link
          to="/goals/review"
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/50"
        >
          <div className="min-w-0">
            <div className="font-semibold">Еженедельный обзор</div>
            <div className="text-xs text-muted">Неделя {weekLabel(reviewWeek)}</div>
          </div>
          {review ? <Stars value={review.rating} /> : <span className="text-sm text-accent">Подвести итоги →</span>}
        </Link>

        <div className="flex gap-2" role="group" aria-label="Фильтр целей">
          <Chip active={filter === 'active'} onClick={() => setFilter('active')}>
            Активные
          </Chip>
          <Chip active={filter === 'done'} onClick={() => setFilter('done')}>
            Завершённые
          </Chip>
        </div>

        {goals && visible.length === 0 ? (
          <EmptyState
            title={filter === 'active' ? 'Нет активных целей' : 'Завершённых целей пока нет'}
            hint={filter === 'active' ? 'Поставьте цель и разбейте её на измеримые результаты.' : undefined}
            action={
              filter === 'active' ? (
                <Link to="/goals/new" className={LINK_PRIMARY}>
                  Добавить цель
                </Link>
              ) : undefined
            }
          />
        ) : (
          LIFE_AREAS.map((a) => {
            const list = visible.filter((g) => g.area === a.id)
            if (list.length === 0) return null
            return (
              <section key={a.id} aria-label={a.name}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted uppercase tracking-wide">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                  {a.name}
                </h2>
                <ul className="space-y-2">
                  {list.map((g) => (
                    <GoalRow key={g.id} goal={g} />
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </div>
    </>
  )
}
