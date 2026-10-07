import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { db } from '../../db'
import type { LifeGoal } from '../../db/types'
import {
  Card,
  CountUp,
  EmptyState,
  Icon,
  IconBadge,
  LinkButton,
  PageHeader,
  SectionHeader,
  SegmentedControl,
  StatTile,
} from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import { LIFE_AREAS } from './areas'
import { reviewTargetWeek, weekLabel, wheelValues } from './calc'
import { GoalRow, Stars } from './components'
import { ensureGoalsSeeded } from './seed'
import { AXIS_TICK, GRID_STROKE, SERIES, staggerItem } from './styles'

type Filter = 'active' | 'done'

const inFilter = (g: LifeGoal, f: Filter) =>
  f === 'active'
    ? g.status === 'active' || g.status === 'paused'
    : g.status === 'done' || g.status === 'dropped'

const pctFormat = (n: number) => `${Math.round(n)}%`

export function GoalsPage() {
  useEffect(() => {
    void ensureGoalsSeeded()
  }, [])
  const reduce = useReduceMotion()
  const goals = useLiveQuery(() => db.lifeGoals.orderBy('sort').toArray(), [])
  const reviewWeek = reviewTargetWeek()
  const review = useLiveQuery(
    () => db.weeklyReviews.where('weekStart').equals(reviewWeek).first(),
    [reviewWeek],
  )
  const [filter, setFilter] = useState<Filter>('active')

  const wheel = wheelValues(goals ?? [])
  const chartData = wheel.map((w) => ({ ...w, label: w.short }))
  const visible = (goals ?? []).filter((g) => inFilter(g, filter))
  const overall = wheel.some((w) => w.goals > 0)
    ? Math.round(
        wheel.filter((w) => w.goals > 0).reduce((s, w) => s + w.value, 0) /
          wheel.filter((w) => w.goals > 0).length,
      )
    : 0

  return (
    <>
      <PageHeader
        title="Цели"
        subtitle="Сферы жизни и ключевые результаты"
        back="/growth"
        action={
          <LinkButton to="/goals/new" size="sm" icon="plus">
            Цель
          </LinkButton>
        }
      />

      <Card variant="elevated" tone="accent">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-tight">Колесо баланса</h2>
            <p className="text-xs text-muted">Средний прогресс KR активных целей по сферам</p>
          </div>
          <div className="shrink-0 text-right">
            <CountUp value={overall} format={pctFormat} className="text-2xl font-bold tracking-tight" />
            <div className="text-[11px] text-muted">в среднем</div>
          </div>
        </div>
        <div className="h-64 w-full" data-testid="balance-wheel">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData} outerRadius="70%" margin={{ top: 8, right: 28, bottom: 8, left: 28 }}>
              <PolarGrid stroke={GRID_STROKE} />
              <PolarAngleAxis dataKey="label" tick={AXIS_TICK} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
              <Radar
                name="Прогресс"
                dataKey="value"
                stroke={SERIES}
                fill={SERIES}
                fillOpacity={0.22}
                strokeWidth={2}
                dot={{ r: 3, fill: SERIES, strokeWidth: 0 }}
                isAnimationActive={!reduce}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Link
        to="/goals/review"
        className="mt-3 flex items-center gap-3 rounded-3xl border border-white/[0.06] bg-surface bg-[image:var(--gradient-surface)] p-4 shadow-[var(--shadow-card)] transition-[border-color,transform] duration-150 hover:border-white/15 active:scale-[0.99] motion-reduce:active:scale-100"
      >
        <IconBadge name="calendar" tone="amber" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold tracking-tight">Еженедельный обзор</div>
          <div className="text-xs text-muted tabular-nums">Неделя {weekLabel(reviewWeek)}</div>
        </div>
        {review ? (
          <Stars value={review.rating} />
        ) : (
          <span className="flex shrink-0 items-center text-sm font-medium text-accent">
            Подвести итоги
            <Icon name="chevron-right" size={16} />
          </span>
        )}
      </Link>

      <SegmentedControl
        aria-label="Фильтр целей"
        className="mt-5 mb-1"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: 'Активные' },
          { value: 'done', label: 'Завершённые' },
        ]}
      />

      {goals && visible.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="target"
            tone="accent"
            title={filter === 'active' ? 'Нет активных целей' : 'Завершённых целей пока нет'}
            hint={filter === 'active' ? 'Поставьте цель и разбейте её на измеримые результаты.' : undefined}
            action={
              filter === 'active' ? (
                <LinkButton to="/goals/new" icon="plus">
                  Добавить цель
                </LinkButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        LIFE_AREAS.map((a) => {
          const list = visible.filter((g) => g.area === a.id)
          if (list.length === 0) return null
          return (
            <section key={a.id} aria-label={a.name}>
              <SectionHeader title={a.name} icon={a.iconName} tone={a.tone} as="h3" className="mt-5" />
              <ul className="space-y-2.5">
                {list.map((g, i) => (
                  <motion.li key={g.id} {...staggerItem(i, reduce)}>
                    <GoalRow goal={g} />
                  </motion.li>
                ))}
              </ul>
            </section>
          )
        })
      )}
      <SectionHeader title="Баланс по сферам" icon="target" tone="accent" className="mt-8" />
      <ul
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 [&>li:last-child]:col-span-2 sm:[&>li:last-child]:col-span-1"
        aria-label="Баланс по сферам"
      >
        {wheel.map((w, i) => {
          const a = LIFE_AREAS.find((x) => x.id === w.area)!
          return (
            <motion.li key={w.area} {...staggerItem(i, reduce)}>
              <StatTile
                className="h-full"
                icon={a.iconName}
                tone={a.tone}
                label={w.name}
                value={
                  <CountUp
                    value={w.value}
                    delay={Math.min(i, 9) * 0.04}
                    format={pctFormat}
                    className={w.goals > 0 ? '' : 'text-muted'}
                  />
                }
                sub={w.goals > 0 ? `${w.goals} ${w.goals === 1 ? 'цель' : w.goals < 5 ? 'цели' : 'целей'}` : 'нет целей'}
              />
            </motion.li>
          )
        })}
      </ul>

    </>
  )
}
