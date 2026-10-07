import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { Button, Card, Field, IconBadge, Input, PageHeader } from '../../components/ui'
import { Icon, type IconName } from '../../components/icons'
import { useReduceMotion } from '../../components/ui/helpers'
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
  const reduce = useReduceMotion()

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
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <Card className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CardTitle icon="moon" className="mb-0 sm:col-span-2">
            Время сна
          </CardTitle>
          <Field label="Отбой">
            <Input type="datetime-local" value={bed} onChange={(e) => setBed(e.target.value)} />
          </Field>
          <Field label="Подъём">
            <Input type="datetime-local" value={wake} onChange={(e) => setWake(e.target.value)} />
          </Field>
          <div className="flex items-center gap-3 rounded-2xl bg-violet/10 px-3 py-2.5 sm:col-span-2">
            <IconBadge name="timer" tone="violet" size="sm" />
            <span className="text-sm text-muted">Длительность:</span>
            <span
              className="ml-auto text-lg font-semibold tracking-tight text-violet tabular-nums"
              data-testid="sleep-duration"
            >
              {duration != null ? formatMinutes(duration) : '—'}
            </span>
          </div>
        </Card>

        <Card>
          <CardTitle icon="star">Качество</CardTitle>
          <div
            className="grid grid-cols-5 gap-1 rounded-2xl border border-white/[0.05] bg-surface-2/80 p-1"
            role="group"
            aria-label="Качество сна"
          >
            {([1, 2, 3, 4, 5] as const).map((q) => {
              const active = quality === q
              return (
                <button
                  key={q}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${q} — ${QUALITY_RU[q]}`}
                  onClick={() => setQuality(q)}
                  className={`relative min-h-11 rounded-xl text-lg font-semibold tabular-nums transition-colors ${
                    active ? 'text-bg' : 'text-muted hover:text-text'
                  }`}
                >
                  {active &&
                    (reduce ? (
                      <span aria-hidden className="absolute inset-0 rounded-xl bg-violet" />
                    ) : (
                      <motion.span
                        aria-hidden
                        layoutId="sleep-quality-thumb"
                        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                        className="absolute inset-0 rounded-xl bg-violet shadow-[0_6px_16px_-8px_var(--color-violet)]"
                      />
                    ))}
                  <span className="relative">{q}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-2.5 flex items-center justify-center gap-1 text-sm font-medium text-violet">
            {Array.from({ length: quality }, (_, i) => (
              <Icon key={i} name="star" size={14} />
            ))}
            <span className="ml-1">{QUALITY_RU[quality]}</span>
          </p>
        </Card>

        <Card>
          <Field label="Заметка">
            <Input value={notes} placeholder="Кофе вечером, шум…" onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Card>

        {submitted && error && (
          <p role="alert" className="flex items-center gap-2 rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger">
            <Icon name="info" size={16} className="shrink-0" />
            {error}
          </p>
        )}
        {!submitted && error && (
          <p className="flex items-center gap-2 rounded-2xl bg-warn/10 px-3 py-2 text-sm text-warn">
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
      <Icon name={icon} size={17} className="text-violet" />
      {children}
    </h2>
  )
}
