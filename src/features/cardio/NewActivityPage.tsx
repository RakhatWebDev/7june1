import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button, Card, Chip, Field, Input, PageHeader } from '../../components/ui'
import { db } from '../../db'
import type { Activity, ActivityType } from '../../db/types'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import {
  ACTIVITY_ICON,
  ACTIVITY_RU,
  ACTIVITY_TYPES,
  estimateKcal,
  formatPace,
  hasDistance,
  isActivityType,
  MET,
  pace,
} from './calc'
import { useBodyWeight } from './useBodyWeight'

/** "" → null, otherwise a finite number (comma decimal separator allowed). */
function num(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function NewActivityPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const initialType = params.get('type')
  const [type, setType] = useState<ActivityType>(isActivityType(initialType) ? initialType : 'run')
  const [date, setDate] = useState(today())
  const [duration, setDuration] = useState('')
  const [distance, setDistance] = useState('')
  const [count, setCount] = useState('')
  const [avgHr, setAvgHr] = useState('')
  const [kcalInput, setKcalInput] = useState('')
  const [kcalTouched, setKcalTouched] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const weightKg = useBodyWeight()
  const durationMin = num(duration)
  const isSwim = type === 'swim'
  // Swimming distance is entered in metres, everything else in kilometres.
  const distanceRaw = num(distance)
  const distanceKm = distanceRaw == null ? null : isSwim ? distanceRaw / 1000 : distanceRaw
  const kcalEstimate = estimateKcal(type, durationMin, weightKg)
  const kcalValue = kcalTouched ? kcalInput : kcalEstimate == null ? '' : String(kcalEstimate)
  const currentPace = hasDistance(type) ? pace(type, durationMin, distanceKm) : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (durationMin == null || durationMin <= 0) {
      setError('Укажите длительность в минутах')
      return
    }
    if (!date) {
      setError('Укажите дату')
      return
    }
    const activity: Activity = { id: newId(), type, date, durationMin }
    if (hasDistance(type) && distanceKm != null && distanceKm > 0) activity.distanceKm = Number(distanceKm.toFixed(3))
    const jumps = num(count)
    if (type === 'rope' && jumps != null && jumps > 0) activity.count = Math.round(jumps)
    const hr = num(avgHr)
    if (hr != null && hr > 0) activity.avgHr = Math.round(hr)
    const kcal = num(kcalValue)
    if (kcal != null && kcal >= 0) activity.kcal = Math.round(kcal)
    if (notes.trim()) activity.notes = notes.trim()
    setSaving(true)
    await db.activities.add(activity)
    navigate('/cardio')
  }

  return (
    <>
      <PageHeader title="Новая активность" back="/cardio" />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Card>
          <span className="mb-2 block text-xs font-medium tracking-wide text-muted uppercase">Тип</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Тип активности">
            {ACTIVITY_TYPES.map((t) => (
              <Chip key={t} active={t === type} onClick={() => setType(t)}>
                <span aria-hidden>{ACTIVITY_ICON[t]}</span> {ACTIVITY_RU[t]}
              </Chip>
            ))}
          </div>
        </Card>

        <Card className="grid grid-cols-2 gap-3">
          <Field label="Дата" className="col-span-2 sm:col-span-1">
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Длительность, мин" className="col-span-2 sm:col-span-1">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="30"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </Field>

          {hasDistance(type) && (
            <Field label={isSwim ? 'Дистанция, м' : 'Дистанция, км'}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={isSwim ? 25 : 0.1}
                placeholder={isSwim ? '1000' : '5'}
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
              />
            </Field>
          )}
          {type === 'rope' && (
            <Field label="Прыжков">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="1000"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </Field>
          )}
          <Field label="Средний пульс">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="уд/мин"
              value={avgHr}
              onChange={(e) => setAvgHr(e.target.value)}
            />
          </Field>

          {currentPace && (
            <div className="col-span-2 rounded-xl bg-surface-2 px-3 py-2 text-sm" data-testid="pace">
              Темп: <span className="font-semibold text-accent">{formatPace(currentPace)}</span>
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <Field
            label="Ккал"
            hint={
              kcalTouched
                ? 'Введено вручную'
                : weightKg
                  ? `Оценка: MET ${MET[type]} × ${weightKg} кг × часы`
                  : 'Укажите вес в профиле для авто-оценки'
            }
          >
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={kcalValue}
                onChange={(e) => {
                  setKcalTouched(true)
                  setKcalInput(e.target.value)
                }}
              />
              {kcalTouched && (
                <Button variant="secondary" onClick={() => setKcalTouched(false)} aria-label="Вернуть авто-оценку">
                  Авто
                </Button>
              )}
            </div>
          </Field>
          <Field label="Заметка">
            <Input value={notes} placeholder="Как прошло?" onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Card>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={saving}>
          Сохранить
        </Button>
      </form>
    </>
  )
}
