import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button, Card, Field, Input, PageHeader } from '../../components/ui'
import { Icon, type IconName } from '../../components/icons'
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
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <Card>
          <CardTitle icon="activity">Тип</CardTitle>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Тип активности">
            {ACTIVITY_TYPES.map((t) => {
              const active = t === type
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setType(t)}
                  className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-1 pt-2.5 pb-2 text-[11px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-95 motion-reduce:active:scale-100 ${
                    active
                      ? 'border-info/50 bg-info/10 text-info'
                      : 'border-white/[0.05] bg-surface-2 text-muted hover:text-text'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`grid size-8 place-items-center rounded-xl transition-colors ${
                      active ? 'bg-info text-bg' : 'bg-surface-3 text-muted'
                    }`}
                  >
                    <Icon name={ACTIVITY_ICON[t]} size={18} />
                  </span>
                  <span className="w-full truncate text-center">{ACTIVITY_RU[t]}</span>
                </button>
              )
            })}
          </div>
        </Card>

        <Card className="grid grid-cols-2 gap-3">
          <CardTitle icon="timer" className="col-span-2 mb-0">
            Когда и сколько
          </CardTitle>
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
            <div
              className="col-span-2 flex items-center gap-2 rounded-2xl bg-info/10 px-3 py-2.5 text-sm"
              data-testid="pace"
            >
              <Icon name="activity" size={16} className="text-info" />
              Темп: <span className="font-semibold text-info tabular-nums">{formatPace(currentPace)}</span>
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <CardTitle icon="flame" className="mb-0">
            Энергия и заметка
          </CardTitle>
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
                <Button
                  variant="secondary"
                  icon="sparkles"
                  onClick={() => setKcalTouched(false)}
                  aria-label="Вернуть авто-оценку"
                >
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
          <p role="alert" className="flex items-center gap-2 rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger">
            <Icon name="info" size={16} className="shrink-0" />
            {error}
          </p>
        )}
        <Button type="submit" size="lg" icon="check" className="w-full" loading={saving}>
          Сохранить
        </Button>
      </form>
    </>
  )
}

function CardTitle({ icon, children, className = '' }: { icon: IconName; children: ReactNode; className?: string }) {
  return (
    <h2 className={`mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight ${className}`}>
      <Icon name={icon} size={17} className="text-info" />
      {children}
    </h2>
  )
}
