import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMinutes } from '../../lib/dates'
import type { SleepChartPoint } from './calc'

/** 14-day bar chart of hours slept with a dashed target line. */
export function SleepChart({ data, targetMin }: { data: SleepChartPoint[]; targetMin: number | null }) {
  const targetH = targetMin ? targetMin / 60 : null
  const maxH = Math.max(10, Math.ceil(Math.max(targetH ?? 0, ...data.map((d) => d.hours ?? 0))))
  return (
    <div className="h-56 w-full" role="img" aria-label="Сон за 14 дней, часы">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
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
            cursor={{ fill: 'var(--color-surface-2)' }}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              color: 'var(--color-text)',
            }}
            labelStyle={{ color: 'var(--color-muted)' }}
            formatter={(v) => [typeof v === 'number' ? formatMinutes(v * 60) : '—', 'Сон']}
          />
          {targetH != null && (
            <ReferenceLine
              y={targetH}
              stroke="var(--color-muted)"
              strokeDasharray="4 4"
              label={{ value: `цель ${Number(targetH.toFixed(1))} ч`, position: 'insideTopRight', fill: 'var(--color-muted)', fontSize: 10 }}
            />
          )}
          <Bar dataKey="hours" fill="var(--color-accent)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
