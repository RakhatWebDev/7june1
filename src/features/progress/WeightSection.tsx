import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { kg } from '../../lib/format'
import { newId } from '../../lib/id'
import { Button, Card, EmptyState, Field, Input, Stat } from '../../components/ui'
import { movingAverage } from './calc'
import { AXIS_TICK, GRID_STROKE, SERIES, SERIES_SECONDARY, TOOLTIP_PROPS, longDate, shortDate } from './chartTheme'

export function WeightSection() {
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray(), [])
  const profile = useLiveQuery(() => db.profile.get(1), [])
  const [date, setDate] = useState(today())
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')

  const points = movingAverage(weights ?? [])
  const latest = points.at(-1)
  const first = points[0]
  const target = profile?.targetWeightKg

  async function save(e: FormEvent) {
    e.preventDefault()
    const w = Number(weight.replace(',', '.'))
    if (!Number.isFinite(w) || w <= 0) return
    const bf = bodyFat ? Number(bodyFat.replace(',', '.')) : undefined
    // One entry per day: re-entering a day overwrites it.
    const existing = await db.weights.where('date').equals(date).first()
    await db.weights.put({
      id: existing?.id ?? newId(),
      date,
      weightKg: w,
      ...(bf != null && Number.isFinite(bf) ? { bodyFatPct: bf } : {}),
    })
    setWeight('')
    setBodyFat('')
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Сейчас" value={latest ? kg(latest.weightKg) : '—'} sub={latest ? `ср. 7 дн: ${kg(latest.avgKg)}` : undefined} />
        <Stat
          label="С начала"
          value={latest && first ? signed(latest.weightKg - first.weightKg) : '—'}
          sub={first ? `с ${shortDate(first.date)}` : undefined}
        />
        <Stat
          label="До цели"
          value={latest && target != null ? signed(latest.weightKg - target) : '—'}
          sub={target != null ? `цель ${kg(target)}` : 'цель не задана'}
        />
      </div>

      <Card>
        <h2 className="mb-1 font-semibold">Динамика веса</h2>
        <div className="mb-2 flex gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-info" /> замеры
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded bg-accent" /> среднее за 7 дней
          </span>
        </div>
        {points.length === 0 ? (
          <EmptyState title="Нет записей веса" hint="Добавьте первое взвешивание ниже." />
        ) : (
          <div className="h-56 w-full" data-testid="weight-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_TICK} stroke={GRID_STROKE} minTickGap={16} />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={AXIS_TICK} stroke={GRID_STROKE} allowDecimals={false} />
                <Tooltip
                  {...TOOLTIP_PROPS}
                  labelFormatter={(l) => longDate(String(l))}
                  formatter={(v, name) => [kg(Number(v)), name === 'avgKg' ? 'Среднее 7 дн' : 'Вес']}
                />
                <Scatter dataKey="weightKg" fill={SERIES_SECONDARY} isAnimationActive={false} />
                <Line
                  type="monotone"
                  dataKey="avgKg"
                  stroke={SERIES}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Добавить взвешивание</h2>
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <Field label="Дата" className="col-span-2">
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
          </Field>
          <Field label="Вес, кг">
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="20"
              max="400"
              required
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={latest ? String(latest.weightKg) : '80'}
            />
          </Field>
          <Field label="Жир, % (опц.)">
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="2"
              max="70"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
            />
          </Field>
          <Button type="submit" className="col-span-2">
            Сохранить
          </Button>
        </form>
      </Card>

      {weights && weights.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">История</h2>
          <ul className="divide-y divide-border">
            {[...weights].reverse().map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-muted">{longDate(w.date)}</span>
                <span className="ml-auto font-medium">
                  {kg(w.weightKg)}
                  {w.bodyFatPct != null && <span className="ml-2 text-xs text-muted">{w.bodyFatPct}% жира</span>}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Удалить запись ${longDate(w.date)}`}
                  onClick={() => db.weights.delete(w.id)}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function signed(n: number): string {
  const v = Math.round(n * 10) / 10
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} кг`
}
