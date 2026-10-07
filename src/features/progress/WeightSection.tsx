import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { kg } from '../../lib/format'
import { newId } from '../../lib/id'
import {
  Button,
  Card,
  CountUp,
  EmptyState,
  Field,
  Icon,
  IconBadge,
  Input,
  SectionHeader,
  StaggerList,
  StatTile,
} from '../../components/ui'
import { movingAverage } from './calc'
import {
  AXIS_TICK,
  GRID_STROKE,
  SERIES_AVG,
  SERIES_SECONDARY,
  TOOLTIP_PROPS,
  longDate,
  shortDate,
  useChartAnimation,
} from './chartTheme'

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

  const anim = useChartAnimation()
  const sinceStart = latest && first ? latest.weightKg - first.weightKg : null
  const toGoal = latest && target != null ? latest.weightKg - target : null

  return (
    <div>
      <Card variant="accent" tone="accent" className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-wide text-muted uppercase">Сейчас</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              {latest ? (
                <CountUp
                  value={latest.weightKg}
                  format={(v) => String(Math.round(v * 10) / 10)}
                  className="text-[44px] leading-none font-bold tracking-tight"
                />
              ) : (
                <span className="text-[44px] leading-none font-bold tracking-tight text-muted">
                  —
                </span>
              )}
              <span className="text-lg font-medium text-muted">кг</span>
            </div>
            <p className="mt-2 text-sm text-muted tabular-nums">
              {latest ? `среднее за 7 дней: ${kg(latest.avgKg)}` : 'добавьте первое взвешивание'}
            </p>
          </div>
          <IconBadge name="scale" tone="accent" size="lg" />
        </div>
      </Card>

      <StaggerList className="mt-3 grid grid-cols-2 gap-3" itemClassName="*:h-full" delay={0.08}>
        <StatTile
          key="since"
          icon="history"
          tone="info"
          label="С начала"
          value={<DeltaValue value={sinceStart} />}
          sub={first ? `с ${shortDate(first.date)}` : undefined}
        />
        <StatTile
          key="goal"
          icon="target"
          tone="warn"
          label="До цели"
          value={<DeltaValue value={toGoal} />}
          sub={target != null ? `цель ${kg(target)}` : 'цель не задана'}
        />
      </StaggerList>

      <SectionHeader title="Динамика веса" icon="chart" tone="accent" />
      <Card>
        {points.length === 0 ? (
          <EmptyState
            icon="scale"
            tone="accent"
            title="Нет записей веса"
            hint="Добавьте первое взвешивание ниже."
          />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-info" /> взвешивания
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed border-accent" /> среднее
                за 7 дней
              </span>
              {target != null && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t border-dashed border-warn" /> цель
                </span>
              )}
            </div>
            <div className="h-56 w-full" data-testid="weight-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    tick={AXIS_TICK}
                    stroke={GRID_STROKE}
                    tickLine={false}
                    minTickGap={16}
                  />
                  <YAxis
                    domain={['dataMin - 1', 'dataMax + 1']}
                    tick={AXIS_TICK}
                    stroke={GRID_STROKE}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    {...TOOLTIP_PROPS}
                    labelFormatter={(l) => longDate(String(l))}
                    formatter={(v, name) => [
                      kg(Number(v)),
                      name === 'avgKg' ? 'Среднее 7 дн' : 'Вес',
                    ]}
                  />
                  {target != null && (
                    <ReferenceLine
                      y={target}
                      stroke="var(--color-warn)"
                      strokeDasharray="2 4"
                      ifOverflow="extendDomain"
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="weightKg"
                    stroke={SERIES_SECONDARY}
                    strokeOpacity={0.45}
                    strokeWidth={1.5}
                    dot={{ r: 3, fill: SERIES_SECONDARY, strokeWidth: 0, fillOpacity: 1 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    {...anim}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgKg"
                    stroke={SERIES_AVG}
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    {...anim}
                    animationBegin={150}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>

      <SectionHeader title="Добавить взвешивание" icon="plus" tone="accent" />
      <Card>
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <Field label="Дата" className="col-span-2">
            <Input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value || today())}
            />
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
              className="tabular-nums"
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
              className="tabular-nums"
            />
          </Field>
          <Button type="submit" size="lg" icon="check" className="col-span-2">
            Сохранить
          </Button>
        </form>
      </Card>

      {weights && weights.length > 0 && (
        <>
          <SectionHeader title="История" icon="history" tone="muted" />
          <Card as="div" padding="none" className="overflow-hidden">
            <StaggerList as="ul" className="divide-y divide-white/[0.05]">
              {[...weights].reverse().map((w) => (
                <div key={w.id} className="flex items-center gap-3 py-1.5 pr-1.5 pl-4 text-sm">
                  <span className="text-muted tabular-nums">{longDate(w.date)}</span>
                  <span className="ml-auto text-right tabular-nums">
                    <span className="font-semibold">{kg(w.weightKg)}</span>
                    {w.bodyFatPct != null && (
                      <span className="ml-2 text-xs text-muted">{w.bodyFatPct}% жира</span>
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label={`Удалить запись ${longDate(w.date)}`}
                    onClick={() => db.weights.delete(w.id)}
                    className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              ))}
            </StaggerList>
          </Card>
        </>
      )}
    </div>
  )
}

/** Signed kg delta with a coloured arrow (down = info, up = warn). */
function DeltaValue({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">—</span>
  const v = Math.round(value * 10) / 10
  const dir = v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${dir === 'up' ? 'text-warn' : dir === 'down' ? 'text-info' : ''}`}
    >
      {dir !== 'flat' && (
        <Icon name={dir === 'up' ? 'arrow-up' : 'arrow-down'} size={18} strokeWidth={2.25} />
      )}
      {signed(value)}
    </span>
  )
}

function signed(n: number): string {
  const v = Math.round(n * 10) / 10
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} кг`
}
