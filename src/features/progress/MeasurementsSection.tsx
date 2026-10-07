import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Measurement } from '../../db/types'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import { Button, Card, EmptyState, Field, Input } from '../../components/ui'
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

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 font-semibold">Новые замеры, см</h2>
        <form onSubmit={save} className="space-y-3">
          <Field label="Дата">
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            {MEASUREMENT_FIELDS.map(({ key, label }) => (
              <Field key={key} label={label}>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  value={form[key] ?? ''}
                  placeholder={list[0]?.[key] != null ? String(list[0][key]) : ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full">
            Сохранить замеры
          </Button>
        </form>
      </Card>

      {list.length === 0 ? (
        <EmptyState title="Замеров пока нет" hint="Измеряйте раз в 2–4 недели утром, в одних и тех же точках." />
      ) : (
        <div className="space-y-3">
          <h2 className="font-semibold">Последние записи</h2>
          {list.slice(0, SHOWN_RECORDS).map((m, i) => {
            const delta = measurementDelta(m, list[i + 1])
            const filled = MEASUREMENT_FIELDS.filter(({ key }) => m[key] != null)
            return (
              <Card key={m.id}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">{longDate(m.date)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Удалить замеры ${longDate(m.date)}`}
                    onClick={() => db.measurements.delete(m.id)}
                  >
                    ✕
                  </Button>
                </div>
                <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                  {filled.map(({ key, label }) => (
                    <div key={key}>
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd>
                        {m[key]}
                        {delta[key] != null && delta[key] !== 0 && (
                          <span className="ml-1 text-xs text-muted">
                            {delta[key]! > 0 ? '+' : '−'}
                            {Math.abs(delta[key]!)}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
