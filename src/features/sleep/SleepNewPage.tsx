import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, Card, Field, Input, PageHeader } from '../../components/ui'
import { db } from '../../db'
import type { SleepEntry } from '../../db/types'
import { formatMinutes, toISODate } from '../../lib/dates'
import { newId } from '../../lib/id'
import { fromLocalInput, QUALITY_RU, sleepDurationMin, toLocalInput, validateSleep } from './calc'

type Quality = SleepEntry['quality']

function defaultTimes(): { bed: string; wake: string } {
  const wake = new Date()
  wake.setHours(7, 0, 0, 0)
  const bed = new Date(wake)
  bed.setDate(bed.getDate() - 1)
  bed.setHours(23, 0, 0, 0)
  return { bed: toLocalInput(bed), wake: toLocalInput(wake) }
}

export function SleepNewPage() {
  const navigate = useNavigate()
  const [initial] = useState(defaultTimes)
  const [bed, setBed] = useState(initial.bed)
  const [wake, setWake] = useState(initial.wake)
  const [quality, setQuality] = useState<Quality>(3)
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const bedDate = fromLocalInput(bed)
  const wakeDate = fromLocalInput(wake)
  const error = validateSleep(bedDate, wakeDate)
  const duration = !error && bedDate && wakeDate ? sleepDurationMin(bedDate, wakeDate) : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (error || !bedDate || !wakeDate || duration == null) return
    const entry: SleepEntry = {
      id: newId(),
      date: toISODate(wakeDate),
      bedtime: bedDate.toISOString(),
      wakeTime: wakeDate.toISOString(),
      durationMin: duration,
      quality,
    }
    if (notes.trim()) entry.notes = notes.trim()
    setSaving(true)
    await db.sleep.add(entry)
    navigate('/sleep')
  }

  return (
    <>
      <PageHeader title="Записать сон" back="/sleep" />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Card className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Отбой">
            <Input type="datetime-local" value={bed} onChange={(e) => setBed(e.target.value)} />
          </Field>
          <Field label="Подъём">
            <Input type="datetime-local" value={wake} onChange={(e) => setWake(e.target.value)} />
          </Field>
          <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm sm:col-span-2">
            Длительность:{' '}
            <span className="font-semibold text-accent" data-testid="sleep-duration">
              {duration != null ? formatMinutes(duration) : '—'}
            </span>
          </div>
        </Card>

        <Card>
          <span className="mb-2 block text-xs font-medium tracking-wide text-muted uppercase">Качество</span>
          <div className="grid grid-cols-5 gap-2" role="group" aria-label="Качество сна">
            {([1, 2, 3, 4, 5] as const).map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={quality === q}
                aria-label={`${q} — ${QUALITY_RU[q]}`}
                onClick={() => setQuality(q)}
                className={`rounded-xl border py-3 text-lg font-semibold ${
                  quality === q ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2 text-muted'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-sm text-muted">{QUALITY_RU[quality]}</p>
        </Card>

        <Card>
          <Field label="Заметка">
            <Input value={notes} placeholder="Кофе вечером, шум…" onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Card>

        {submitted && error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {!submitted && error && <p className="text-sm text-warn">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={saving}>
          Сохранить
        </Button>
      </form>
    </>
  )
}
