import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReduceMotion } from '../../components/ui/helpers'
import type { MoodPoint } from './calc'

const TOOLTIP_STYLE = {
  background: 'var(--color-surface-2)',
  border: '1px solid rgb(255 255 255 / 0.08)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-float)',
  color: 'var(--color-text)',
  fontSize: 12,
  padding: '8px 10px',
}

/** 30-day line chart of mood (violet) and energy (info, dashed), 1–5; lines draw in over 600 ms. */
export function MoodChart({ data }: { data: MoodPoint[] }) {
  const reduce = useReduceMotion()
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
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: 'var(--color-muted)', marginBottom: 2 }}
            itemStyle={{ padding: 0 }}
            cursor={{ stroke: 'var(--color-violet)', strokeOpacity: 0.35, strokeWidth: 1 }}
            formatter={(v, name) => [typeof v === 'number' ? v.toFixed(1) : '—', name === 'mood' ? 'Настроение' : 'Энергия']}
          />
          <Line
            type="monotone"
            dataKey="mood"
            stroke="var(--color-violet)"
            strokeWidth={2.75}
            dot={{ r: 2.5, fill: 'var(--color-violet)', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: 'var(--color-violet)', stroke: 'var(--color-bg)', strokeWidth: 2 }}
            connectNulls
            isAnimationActive={!reduce}
            animationDuration={600}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="energy"
            stroke="var(--color-info)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 4, fill: 'var(--color-info)', stroke: 'var(--color-bg)', strokeWidth: 2 }}
            connectNulls
            isAnimationActive={!reduce}
            animationDuration={600}
            animationBegin={120}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
