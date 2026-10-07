import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReduceMotion } from '../../components/ui/helpers'
import { formatMinutes } from '../../lib/dates'
import type { SleepChartPoint } from './calc'

const VIOLET = 'var(--color-violet)'
const VIOLET_DIM = 'color-mix(in srgb, var(--color-violet) 45%, transparent)'

/** 14-day bar chart of hours slept with a dashed target line; nights below target are dimmed. */
export function SleepChart({ data, targetMin }: { data: SleepChartPoint[]; targetMin: number | null }) {
  const reduce = useReduceMotion()
  const targetH = targetMin ? targetMin / 60 : null
  const maxH = Math.max(10, Math.ceil(Math.max(targetH ?? 0, ...data.map((d) => d.hours ?? 0))))
  return (
    <div className="h-56 w-full" role="img" aria-label="Сон за 14 дней, часы">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid stroke="rgb(255 255 255 / 0.06)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
            interval={1}
          />
          <YAxis
            domain={[0, maxH]}
            tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: 'rgb(255 255 255 / 0.04)', radius: 6 }}
            contentStyle={{
              background: 'var(--color-surface-2)',
              border: '1px solid rgb(255 255 255 / 0.08)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-float)',
              color: 'var(--color-text)',
              fontSize: 13,
              padding: '8px 12px',
            }}
            labelStyle={{ color: 'var(--color-muted)', fontSize: 11, marginBottom: 2 }}
            itemStyle={{ color: VIOLET, padding: 0 }}
            formatter={(v) => [typeof v === 'number' ? formatMinutes(v * 60) : '—', 'Сон']}
          />
          {targetH != null && (
            <ReferenceLine
              y={targetH}
              stroke="color-mix(in srgb, var(--color-violet) 60%, transparent)"
              strokeDasharray="4 4"
              label={{
                value: `цель ${Number(targetH.toFixed(1))} ч`,
                position: 'insideTopRight',
                fill: 'var(--color-muted)',
                fontSize: 10,
              }}
            />
          )}
          <Bar
            dataKey="hours"
            radius={[6, 6, 2, 2]}
            maxBarSize={18}
            isAnimationActive={!reduce}
            animationDuration={600}
            animationEasing="ease-out"
          >
            {data.map((d) => (
              <Cell
                key={d.date}
                fill={targetH != null && d.hours != null && d.hours < targetH ? VIOLET_DIM : VIOLET}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
