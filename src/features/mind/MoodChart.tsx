import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MoodPoint } from './calc'

/** 30-day line chart of mood and energy (1–5). */
export function MoodChart({ data }: { data: MoodPoint[] }) {
  return (
    <div className="h-52 w-full" role="img" aria-label="Настроение и энергия за 30 дней">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -28 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
            interval={6}
          />
          <YAxis
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              color: 'var(--color-text)',
            }}
            labelStyle={{ color: 'var(--color-muted)' }}
            formatter={(v, name) => [typeof v === 'number' ? v.toFixed(1) : '—', name === 'mood' ? 'Настроение' : 'Энергия']}
          />
          <Line
            type="monotone"
            dataKey="mood"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: 'var(--color-accent)', strokeWidth: 0 }}
            connectNulls
            animationDuration={600}
          />
          <Line
            type="monotone"
            dataKey="energy"
            stroke="var(--color-info)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
            animationDuration={600}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
