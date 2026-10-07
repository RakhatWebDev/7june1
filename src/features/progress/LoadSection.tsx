import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../../db'
import { int } from '../../lib/format'
import { Card, EmptyState, SectionHeader, StaggerList, StatTile } from '../../components/ui'
import { weeklyVolume } from './calc'
import {
  AXIS_TICK,
  GRID_STROKE,
  SERIES,
  SERIES_SECONDARY,
  TOOLTIP_PROPS,
  useChartAnimation,
} from './chartTheme'

const WEEKS = 12

export function LoadSection() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const anim = useChartAnimation()
  if (!sessions) return null

  const weeks = weeklyVolume(sessions, WEEKS)
  const totalSessions = weeks.reduce((a, w) => a + w.sessions, 0)
  const totalVolume = weeks.reduce((a, w) => a + w.volumeKg, 0)
  const current = weeks[weeks.length - 1]
  const prev = weeks[weeks.length - 2]

  if (totalSessions === 0) {
    return (
      <EmptyState
        icon="dumbbell"
        tone="accent"
        title="Тренировок за 12 недель нет"
        hint="Объём появится после первой тренировки в зале."
      />
    )
  }

  return (
    <div>
      <StaggerList className="grid grid-cols-3 gap-2" itemClassName="*:h-full">
        <StatTile
          key="week"
          icon="dumbbell"
          tone="accent"
          label="Неделя"
          className="p-2.5!"
          value={<span className="text-lg">{tonnage(current.volumeKg)}</span>}
          sub={`прошлая: ${tonnage(prev.volumeKg)}`}
        />
        <StatTile
          key="total"
          icon="activity"
          tone="info"
          label="Тренировок"
          className="p-2.5!"
          value={<span className="text-lg">{totalSessions}</span>}
          sub="за 12 недель"
        />
        <StatTile
          key="avg"
          icon="calendar"
          tone="violet"
          label="В среднем"
          className="p-2.5!"
          value={<span className="text-lg">{(totalSessions / WEEKS).toFixed(1)}</span>}
          sub="в неделю"
        />
      </StaggerList>

      <SectionHeader
        title="Объём по неделям, кг"
        subtitle={`Вес × повторы рабочих подходов, всего ${tonnage(totalVolume)}`}
        icon="chart"
        tone="accent"
      />
      <Card>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                stroke={GRID_STROKE}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis
                tick={AXIS_TICK}
                stroke={GRID_STROKE}
                tickLine={false}
                axisLine={false}
                tickFormatter={compact}
                width={44}
              />
              <Tooltip
                {...TOOLTIP_PROPS}
                labelFormatter={(l) => `Неделя с ${l}`}
                formatter={(v) => [`${int(Number(v))} кг`, 'Объём']}
              />
              <Bar dataKey="volumeKg" radius={[5, 5, 2, 2]} maxBarSize={18} {...anim}>
                {weeks.map((w, i) => (
                  <Cell
                    key={w.label}
                    fill={SERIES}
                    fillOpacity={i === weeks.length - 1 ? 1 : 0.5}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <SectionHeader title="Тренировок в неделю" icon="activity" tone="info" />
      <Card>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                stroke={GRID_STROKE}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis
                tick={AXIS_TICK}
                stroke={GRID_STROKE}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                {...TOOLTIP_PROPS}
                labelFormatter={(l) => `Неделя с ${l}`}
                formatter={(v) => [String(v), 'Тренировок']}
              />
              <Bar
                dataKey="sessions"
                fill={SERIES_SECONDARY}
                radius={[5, 5, 2, 2]}
                maxBarSize={18}
                {...anim}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}

/** Keeps big numbers short enough for a 3-column stat row at 360px. */
function tonnage(n: number): string {
  return n >= 10000 ? `${(Math.round(n / 100) / 10).toLocaleString('ru-RU')} т` : `${int(n)} кг`
}

function compact(n: number): string {
  return n >= 1000 ? `${Math.round(n / 100) / 10}т` : String(n)
}
