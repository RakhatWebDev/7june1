import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '../../db'
import { int } from '../../lib/format'
import { Card, EmptyState, Stat } from '../../components/ui'
import { weeklyVolume } from './calc'
import { AXIS_TICK, GRID_STROKE, SERIES, TOOLTIP_PROPS } from './chartTheme'

const WEEKS = 12

export function LoadSection() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  if (!sessions) return null

  const weeks = weeklyVolume(sessions, WEEKS)
  const totalSessions = weeks.reduce((a, w) => a + w.sessions, 0)
  const totalVolume = weeks.reduce((a, w) => a + w.volumeKg, 0)
  const current = weeks[weeks.length - 1]
  const prev = weeks[weeks.length - 2]

  if (totalSessions === 0) {
    return <EmptyState title="Тренировок за 12 недель нет" hint="Объём появится после первой тренировки в зале." />
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Эта неделя" value={tonnage(current.volumeKg)} sub={`прошлая: ${tonnage(prev.volumeKg)}`} />
        <Stat label="Тренировок" value={totalSessions} sub="за 12 недель" />
        <Stat label="В среднем" value={(totalSessions / WEEKS).toFixed(1)} sub="в неделю" />
      </div>

      <Card>
        <h2 className="font-semibold">Объём по неделям, кг</h2>
        <p className="mb-2 text-xs text-muted">Вес × повторы рабочих подходов, всего {tonnage(totalVolume)}</p>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} stroke={GRID_STROKE} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tick={AXIS_TICK} stroke={GRID_STROKE} tickFormatter={compact} width={44} />
              <Tooltip
                {...TOOLTIP_PROPS}
                labelFormatter={(l) => `Неделя с ${l}`}
                formatter={(v) => [`${int(Number(v))} кг`, 'Объём']}
              />
              <Bar dataKey="volumeKg" fill={SERIES} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Тренировок в неделю</h2>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} stroke={GRID_STROKE} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tick={AXIS_TICK} stroke={GRID_STROKE} allowDecimals={false} />
              <Tooltip
                {...TOOLTIP_PROPS}
                labelFormatter={(l) => `Неделя с ${l}`}
                formatter={(v) => [String(v), 'Тренировок']}
              />
              <Bar dataKey="sessions" fill={SERIES} radius={[4, 4, 0, 0]} isAnimationActive={false} />
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
