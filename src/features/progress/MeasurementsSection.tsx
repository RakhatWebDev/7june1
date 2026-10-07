import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Measurement } from '../../db/types'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  SectionHeader,
  StaggerList,
  StatTile,
} from '../../components/ui'
import { MEASUREMENT_FIELDS, measurementDelta, type MeasurementField } from './calc'
import { longDate } from './chartTheme'

type FormState = Partial<Record<MeasurementField, string>>

const SHOWN_RECORDS = 6

export function MeasurementsSection() {
  const records = useLiveQuery(() => db.measurements.orderBy('date').reverse().toArray(), [])
  const [date, setDate] = useState(today())
  const [form, setForm] = useState<FormState>({})
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const values: Partial<Measurement> = {}
    for (const { key } of MEASUREMENT_FIELDS) {
      const raw = form[key]?.replace(',', '.').trim()
      if (!raw) continue
      const n = Number(raw)
      if (Number.isFinite(n) && n > 0) values[key] = n
    }
    if (Object.keys(values).length === 0) {
      setError('Заполните хотя бы один замер')
      return
    }
    setError(null)
    await db.measurements.add({ id: newId(), date, ...values })
    setForm({})
  }

  const list = records ?? []
  const [latest, ...older] = list.slice(0, SHOWN_RECORDS)

  return (
    <div>
      {latest ? (
        <>
          <SectionHeader
            className="mt-0!"
            title="Последние замеры, см"
            subtitle={`${longDate(latest.date)}${list[1] ? ` · к ${longDate(list[1].date)}` : ''}`}
            icon="target"
            tone="info"
            action={
              <DeleteButton date={latest.date} onClick={() => db.measurements.delete(latest.id)} />
            }
          />
          <StaggerList className="grid grid-cols-3 gap-2" itemClassName="*:h-full">
            {filledFields(latest).map(({ key, label }) => (
              <StatTile
                key={key}
                icon="target"
                tone="info"
                label={label}
                className="p-2.5!"
                value={<span className="text-xl">{latest[key]}</span>}
                sub={<Delta field={key} value={measurementDelta(latest, list[1])[key]} />}
              />
            ))}
          </StaggerList>
        </>
      ) : (
        <EmptyState
          icon="target"
          tone="info"
          title="Замеров пока нет"
          hint="Измеряйте раз в 2–4 недели утром, в одних и тех же точках."
        />
      )}

      <SectionHeader title="Новые замеры, см" icon="plus" tone="info" />
      <Card>
        <form onSubmit={save} className="space-y-3">
          <Field label="Дата">
            <Input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value || today())}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            {MEASUREMENT_FIELDS.map(({ key, label }) => (
              <Field key={key} label={label} className="min-w-0 [&>span]:truncate">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  value={form[key] ?? ''}
                  placeholder={list[0]?.[key] != null ? String(list[0][key]) : ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="px-2.5 tabular-nums"
                />
              </Field>
            ))}
          </div>
          {error && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-danger">
              <Icon name="info" size={15} />
              {error}
            </p>
          )}
          <Button type="submit" size="lg" icon="check" className="w-full">
            Сохранить замеры
          </Button>
        </form>
      </Card>

      {older.length > 0 && (
        <>
          <SectionHeader title="Ранее" icon="history" tone="muted" />
          <StaggerList className="space-y-3">
            {older.map((m, i) => {
              const delta = measurementDelta(m, list[i + 2])
              return (
                <Card key={m.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold tabular-nums">{longDate(m.date)}</span>
                    <DeleteButton date={m.date} onClick={() => db.measurements.delete(m.id)} />
                  </div>
                  <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                    {filledFields(m).map(({ key, label }) => (
                      <div key={key} className="min-w-0">
                        <dt className="truncate text-xs text-muted">{label}</dt>
                        <dd className="tabular-nums">
                          <span className="font-medium">{m[key]}</span>{' '}
                          <Delta field={key} value={delta[key]} quiet />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              )
            })}
          </StaggerList>
        </>
      )}
    </div>
  )
}

const filledFields = (m: Measurement) => MEASUREMENT_FIELDS.filter(({ key }) => m[key] != null)

/** Fields where a smaller number is progress (fat-storage sites); everywhere else growth is good. */
const SMALLER_IS_BETTER = new Set<MeasurementField>(['waistCm', 'hipsCm'])

/** «↓ −1.5» coloured by whether the change is progress (lime) or not (amber). */
function Delta({
  field,
  value,
  quiet = false,
}: {
  field: MeasurementField
  value: number | undefined
  quiet?: boolean
}) {
  if (value == null) return quiet ? null : <span className="text-xs text-muted">новый</span>
  if (value === 0) return quiet ? null : <span className="text-xs text-muted">±0</span>
  const up = value > 0
  const good = SMALLER_IS_BETTER.has(field) ? !up : up
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${good ? 'text-accent' : 'text-warn'}`}
    >
      <Icon name={up ? 'arrow-up' : 'arrow-down'} size={12} strokeWidth={2.5} />
      <span>
        {up ? '+' : '−'}
        {Math.abs(value)}
      </span>
    </span>
  )
}

function DeleteButton({ date, onClick }: { date: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Удалить замеры ${longDate(date)}`}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-danger/15 hover:text-danger"
    >
      <Icon name="trash" size={16} />
    </button>
  )
}
