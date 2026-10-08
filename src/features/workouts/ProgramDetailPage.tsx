import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, EmptyState, Input, PageHeader, Stepper } from '../../components/ui'
import { Icon } from '../../components/icons'
import { db } from '../../db'
import type { Program, ProgramDay } from '../../db/types'
import { asMaxes, getTrainingMaxes, MAXES_KEY, saveMax, suggestedKg } from '../../data/programs/maxes'
import { WEEKDAY_SHORT_RU, weekdayIndex } from '../../lib/dates'
import { setActiveProgram } from './actions'
import { prescriptionSets } from './autoreg'
import { fmtKg, isStartableDay, weekPrescription } from './calc'
import { ConfirmSheet } from './ConfirmSheet'
import { useActiveProgram } from './hooks'
import { DAY_TYPE_RU, programSubtitle, restLabel } from './labels'
import { primaryLink } from './linkStyles'
import {
  asTargetPerWeek,
  blockFor,
  getScheduledDay,
  restartCycle,
  scheduleLabel,
  setCycleWeek,
  setTargetPerWeek,
  TARGET_PER_WEEK_KEY,
  type ScheduledDay,
} from './schedule'

/** /workouts/programs/:id — days with exercises; cycle week, maxes, frequency; start a specific day. */
export function ProgramDetailPage() {
  const { id = '' } = useParams()
  const program = useLiveQuery(async () => (await db.programs.get(id)) ?? null, [id])
  const { program: activeProgram } = useActiveProgram()
  const schedule = useLiveQuery(async () => (program ? await getScheduledDay(db, program) : null), [program])
  const trainingMaxes = useLiveQuery(() => getTrainingMaxes(db), [])

  if (program === undefined) return <PageHeader title="Программа" back="/workouts" />
  if (program === null)
    return (
      <>
        <PageHeader title="Программа" back="/workouts" />
        <EmptyState title="Программа не найдена" />
      </>
    )

  const isActive = activeProgram?.id === program.id
  const sequential = program.schedule === 'sequential'
  const todayIdx = weekdayIndex()
  const viewWeek = schedule?.prescriptionWeek
  const subtitle = programSubtitle(program)
  return (
    <>
      <PageHeader title={program.name} subtitle={subtitle} back="/workouts" />
      <Card>
        <p className="text-sm">{program.description}</p>
        {program.cycleNotes && <p className="mt-2 text-sm text-muted">{program.cycleNotes}</p>}
        {program.source && <p className="mt-2 text-xs text-muted">{program.source}</p>}
        <div className="mt-3">
          {isActive ? (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">Активная программа</span>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => void setActiveProgram(program.id)}>
              Сделать активной
            </Button>
          )}
        </div>
        <FrequencyRow />
      </Card>

      {program.weeks && schedule && <CycleCard program={program} schedule={schedule} />}
      {program.maxLifts && program.maxLifts.length > 0 && <MaxesCard program={program} />}

      <ul className="mt-4 space-y-3">
        {program.days.map((day, i) => {
          const marked = sequential ? schedule?.dayIndex === i : day.weekday === todayIdx
          return (
            <li key={day.id}>
              <DayCard
                program={program}
                day={day}
                marked={marked}
                markLabel={sequential ? 'следующая' : 'сегодня'}
                week={viewWeek}
                trainingMaxes={trainingMaxes ?? {}}
              />
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** «Тренировок в неделю: 3» — settings `training.targetPerWeek`. */
function FrequencyRow() {
  const target = useLiveQuery(async () => asTargetPerWeek((await db.settings.get(TARGET_PER_WEEK_KEY))?.value), [])
  if (target === undefined) return null
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <span className="text-sm">
        Тренировок в неделю: <span className="font-semibold tabular-nums">{target}</span>
        <span className="block text-xs text-muted">цель для счётчика «На этой неделе»</span>
      </span>
      <div className="[&_input]:w-12">
        <Stepper
          aria-label="Тренировок в неделю"
          value={target}
          min={1}
          max={7}
          onChange={(v) => v != null && void setTargetPerWeek(db, v)}
        />
      </div>
    </div>
  )
}

function CycleCard({ program, schedule }: { program: Program; schedule: ScheduledDay }) {
  const [confirm, setConfirm] = useState(false)
  const weeks = program.weeks ?? 0
  const label = scheduleLabel(schedule)
  const current = schedule.isComplete ? -1 : (schedule.prescriptionWeek ?? 0)
  const blocks = program.blocks ?? []
  const block = blockFor(program, current)
  return (
    <Card className="mt-4">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent uppercase">
        <Icon name="calendar" size={14} />
        План · {weeks} нед.
      </p>
      {label && <h2 className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{label}</h2>}
      {block && <p className="text-sm text-muted">{block.label}</p>}
      <p className="mt-1 text-xs text-muted" data-testid="week-hint">
        Неделя программы = {schedule.sessionsPerWeek} тренировки: недели считаются по выполненным тренировкам, а не по
        календарю.
      </p>
      {schedule.isTestWeek && (
        <p className="mt-2 rounded-2xl border border-warn/30 bg-warn/10 p-3 text-sm" data-testid="test-week">
          Тестовая неделя: в базовых подойди к новому максимуму, аксессуары — легко. Новый максимум предложит сохранить
          итог тренировки — дальше веса посчитаются от него.
        </p>
      )}
      {schedule.isComplete && (
        <p className="mt-2 rounded-2xl border border-accent/30 bg-accent/10 p-3 text-sm" data-testid="program-complete">
          Все {weeks} недель пройдены. По желанию — неделя MAX (проверь максимумы), затем «Начать цикл заново».
        </p>
      )}
      <div className="mt-3">
        <p className="mb-1.5 text-xs text-muted">Неделя (можно выбрать вручную)</p>
        <div role="radiogroup" aria-label="Неделя программы" className="grid grid-cols-6 gap-1.5">
          {Array.from({ length: weeks }, (_, i) => {
            const b = blockFor(program, i)
            const active = i === current
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`Неделя ${i + 1}${b ? `: ${b.label}` : ''}`}
                title={b?.label}
                onClick={() => void setCycleWeek(db, program, i)}
                className={`h-9 rounded-xl text-sm font-semibold tabular-nums transition-colors ${
                  active
                    ? 'bg-accent text-bg'
                    : b?.test
                      ? 'bg-warn/15 text-warn hover:bg-warn/25'
                      : 'bg-surface-2 text-text hover:bg-surface-3'
                }`}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
        {blocks.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs" data-testid="blocks">
            {blocks.map((b, i) => {
              const on = current >= b.fromWeek && current <= b.toWeek
              const range = b.fromWeek === b.toWeek ? `${b.fromWeek + 1}` : `${b.fromWeek + 1}–${b.toWeek + 1}`
              return (
                <li key={i} className={`flex gap-2 ${on ? 'font-medium text-accent' : 'text-muted'}`}>
                  <span className="w-10 shrink-0 tabular-nums">нед. {range}</span>
                  <span className="min-w-0">{b.label}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <Button className="mt-3 w-full" size="sm" variant="secondary" icon="history" onClick={() => setConfirm(true)}>
        Начать цикл заново
      </Button>
      <ConfirmSheet
        open={confirm}
        title="Начать цикл заново?"
        text="Неделя 1, первая тренировка программы."
        confirmLabel="Начать заново"
        onConfirm={() => void restartCycle(db, program.id)}
        onClose={() => setConfirm(false)}
      />
    </Card>
  )
}

/** «Мои максимумы» — tested maxes (settings `lifts.maxes`) and the program's %-table. */
function MaxesCard({ program }: { program: Program }) {
  const maxes = useLiveQuery(async () => asMaxes((await db.settings.get(MAXES_KEY))?.value), [])
  const trainingMaxes = useLiveQuery(() => getTrainingMaxes(db), [])
  const table = Object.entries(program.pctTable ?? {}).sort((a, b) => Number(b[0]) - Number(a[0]))
  return (
    <Card className="mt-4">
      <h2 className="flex items-center gap-1.5 font-semibold tracking-tight">
        <Icon name="trophy" size={17} className="text-accent" />
        Мои максимумы
      </h2>
      <p className="mt-0.5 text-xs text-muted">
        Разовый максимум (1RM), кг. Веса в программе = % × максимум, шаг 2,5 кг.
      </p>
      {maxes && (
        <ul className="mt-3 space-y-2">
          {program.maxLifts?.map((m) => {
            const v = maxes[m.exerciseId]
            const tm = trainingMaxes?.[m.exerciseId]
            return (
              <li key={m.exerciseId} className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{m.label}</span>
                  {tm != null && v != null && tm !== v && (
                    <span className="block text-xs text-muted tabular-nums">тренировочный: {fmtKg(tm)} кг</span>
                  )}
                </span>
                <Input
                  key={`${m.exerciseId}-${v ?? ''}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={2.5}
                  aria-label={`Максимум: ${m.label}`}
                  placeholder="—"
                  className="!w-24 shrink-0 text-right tabular-nums"
                  defaultValue={v ?? ''}
                  onBlur={(e) => {
                    const raw = e.currentTarget.value.replace(',', '.')
                    const kg = raw === '' ? null : Number(raw)
                    if (kg !== null && !(kg > 0)) return
                    if ((kg ?? undefined) !== v) void saveMax(db, m.exerciseId, kg, 'set')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                />
              </li>
            )
          })}
        </ul>
      )}
      {table.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Повторы → % от максимума</p>
          <div className="grid grid-cols-4 gap-1.5 text-center text-xs tabular-nums" data-testid="pct-table">
            {table.map(([reps, pct]) => (
              <span key={reps} className="rounded-xl bg-surface-2 px-1 py-1.5">
                <span className="font-semibold">{reps}</span>
                <span className="text-muted"> → {Math.round(pct * 100)} %</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function DayCard({
  program,
  day,
  marked,
  markLabel,
  week,
  trainingMaxes,
}: {
  program: Program
  day: ProgramDay
  marked: boolean
  markLabel: string
  week?: number
  trainingMaxes: Record<string, number>
}) {
  const sequential = program.schedule === 'sequential'
  const dayIdx = program.days.indexOf(day)
  return (
    <Card as="div" className={marked ? 'border-accent/50' : ''}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            {sequential ? `День ${dayIdx + 1}` : day.weekday != null && WEEKDAY_SHORT_RU[day.weekday]} ·{' '}
            {DAY_TYPE_RU[day.type]}
            {marked && <span className="ml-1 text-accent">· {markLabel}</span>}
          </p>
          <h2 className="font-semibold">{day.name}</h2>
        </div>
      </div>
      {day.notes && <p className="mt-2 text-sm text-muted">{day.notes}</p>}
      {day.exercises.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {day.exercises.map((e, i) => {
            const w = weekPrescription(e, program.weeks ? week : undefined)
            const off = w.sets <= 0
            const perSet = prescriptionSets(w)
            const uniform = perSet.every((t) => t.reps === perSet[0]?.reps)
            const plan = off ? '—' : uniform ? `${w.sets} × ${w.reps}` : w.reps
            const max = trainingMaxes[e.maxLiftId ?? e.exerciseId]
            const kgs = off ? [] : perSet.map((t) => suggestedKg(t.pct, max))
            const kgLine = kgs.some((k) => k != null) ? `${groupKg(uniform ? kgs.slice(0, 1) : kgs)} кг` : undefined
            return (
              <li key={`${e.exerciseId}-${i}`}>
                <Link
                  to={`/workouts/exercises/${encodeURIComponent(e.exerciseId)}`}
                  className={`flex items-start justify-between gap-3 py-2 hover:text-accent ${off ? 'opacity-50' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm">{e.name}</span>
                    <span className="block text-xs text-muted">
                      {[w.intensity, restLabel(e.restSec), off ? w.notes : e.notes].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-medium tabular-nums">{plan}</span>
                    {kgLine && <span className="block text-xs text-accent tabular-nums">{kgLine}</span>}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {isStartableDay(day) && (
        <Link to={`/workouts/start/${program.id}/${day.id}`} className={`${primaryLink} mt-3 w-full`}>
          Начать этот день
        </Link>
      )}
    </Card>
  )
}

/** [57.5, 35, 35, 35, 35] → "57,5 · 4×35"; unknown weights as "—". */
function groupKg(kgs: (number | undefined)[]): string {
  const groups: { kg: number | undefined; n: number }[] = []
  for (const kg of kgs) {
    const last = groups[groups.length - 1]
    if (last && last.kg === kg) last.n++
    else groups.push({ kg, n: 1 })
  }
  return groups.map((g) => `${g.n > 1 ? `${g.n}×` : ''}${g.kg != null ? fmtKg(g.kg) : '—'}`).join(' · ')
}
