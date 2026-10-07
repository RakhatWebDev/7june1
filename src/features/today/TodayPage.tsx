import { useState, type FormEvent, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { db } from '../../db'
import { formatMinutes, today, weekdayIndex } from '../../lib/dates'
import { int, kg, km } from '../../lib/format'
import { newId } from '../../lib/id'
import { Button, Card, Field, Input, PageHeader, Progress, Sheet } from '../../components/ui'
import { computeTargets } from '../nutrition/calc'
import { UpcomingCard } from '../calendar/UpcomingCard'
import {
  ACTIVITY_ICON,
  ACTIVITY_LABEL_RU,
  greeting,
  pickProgram,
  scheduledDay,
  sessionLocalDate,
  sessionVolume,
} from './calc'

const linkPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-strong'
const linkSecondary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-sm text-text hover:bg-border'

/** Loads everything the dashboard needs for the given local day in one live query. */
async function loadDashboard(day: string) {
  const since = new Date(Date.now() - 36 * 3600_000).toISOString()
  const [profile, programs, activeSetting, activeSession, recentSessions, foodEntries, water, sleep, activities, lastWeight] =
    await Promise.all([
      db.profile.get(1),
      db.programs.toArray(),
      db.settings.get('activeProgramId'),
      db.sessions.filter((s) => !s.finishedAt).first(),
      db.sessions.where('startedAt').aboveOrEqual(since).toArray(),
      db.foodEntries.where('date').equals(day).toArray(),
      db.water.where('date').equals(day).toArray(),
      db.sleep.where('date').equals(day).first(),
      db.activities.where('date').equals(day).toArray(),
      db.weights.orderBy('date').last(),
    ])
  const finishedToday = recentSessions.filter((s) => s.finishedAt && sessionLocalDate(s) === day)
  return {
    profile,
    program: pickProgram(programs, activeSetting?.value),
    activeSession,
    finishedToday,
    foodEntries,
    water,
    sleep,
    activities,
    lastWeight,
  }
}

type Dashboard = Awaited<ReturnType<typeof loadDashboard>>

export function TodayPage() {
  const day = today()
  const data = useLiveQuery(() => loadDashboard(day), [day])
  const [now] = useState(() => new Date())
  const name = data?.profile?.name?.trim()

  return (
    <>
      <PageHeader
        title={`${greeting(now.getHours())}${name ? `, ${name}` : ''}`}
        subtitle={capitalize(format(now, 'EEEE, d MMMM', { locale: ru }))}
        action={
          <Link to="/settings" aria-label="Настройки" className={`${linkSecondary} text-lg`}>
            ⚙
          </Link>
        }
      />
      {data && (
        <div className="space-y-3">
          <WorkoutCard data={data} />
          <UpcomingCard />
          <NutritionCard data={data} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SleepCard data={data} />
            <WeightCard data={data} />
          </div>
          <ActivitiesCard data={data} />
        </div>
      )}
    </>
  )
}

function CardTitle({ icon, children, action }: { icon: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
        <span aria-hidden>{icon}</span>
        {children}
      </h2>
      {action}
    </div>
  )
}

function WorkoutCard({ data }: { data: Dashboard }) {
  const { program, activeSession, finishedToday } = data
  const day = scheduledDay(program, weekdayIndex())

  let body: ReactNode
  if (activeSession) {
    const done = activeSession.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)
    const total = activeSession.exercises.reduce((a, e) => a + e.sets.length, 0)
    body = (
      <>
        <p className="text-lg font-semibold">{activeSession.name}</p>
        <p className="mb-3 text-sm text-muted">
          Тренировка идёт · подходов {done} из {total}
        </p>
        <Link to={`/workouts/session/${activeSession.id}`} className={linkPrimary}>
          Продолжить
        </Link>
      </>
    )
  } else if (finishedToday.length > 0) {
    const volume = finishedToday.reduce((a, s) => a + sessionVolume(s), 0)
    const last = finishedToday[finishedToday.length - 1]
    body = (
      <>
        <p className="text-lg font-semibold text-accent">Выполнено ✓</p>
        <p className="mb-3 text-sm text-muted">
          {finishedToday.map((s) => s.name).join(', ')} · объём {int(volume)} кг
        </p>
        <Link to={`/workouts/session/${last.id}`} className={linkSecondary}>
          Открыть
        </Link>
      </>
    )
  } else if (program && day) {
    body =
      day.type === 'rest' ? (
        <>
          <p className="text-lg font-semibold">{day.name}</p>
          <p className="text-sm text-muted">{day.notes ?? 'День отдыха.'}</p>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold">{day.name}</p>
          <p className="mb-3 text-sm text-muted">
            {program.name} · {day.exercises.length} упр.
          </p>
          <Link to={`/workouts/start/${program.id}/${day.id}`} className={linkPrimary}>
            Начать
          </Link>
        </>
      )
  } else {
    body = (
      <>
        <p className="mb-3 text-sm text-muted">
          {program ? 'На сегодня по расписанию тренировки нет.' : 'Программа не выбрана.'}
        </p>
        <Link to="/workouts" className={linkSecondary}>
          К программам
        </Link>
      </>
    )
  }

  return (
    <Card>
      <CardTitle icon="🏋">Тренировка дня</CardTitle>
      {body}
    </Card>
  )
}

function NutritionCard({ data }: { data: Dashboard }) {
  const { profile, foodEntries, water, lastWeight } = data
  const eatenKcal = foodEntries.reduce((a, e) => a + (e.kcal || 0), 0)
  const eatenProtein = foodEntries.reduce((a, e) => a + (e.proteinG || 0), 0)
  const waterMl = water.reduce((a, w) => a + (w.ml || 0), 0)
  const targets = profile ? computeTargets(profile, lastWeight?.weightKg ?? profile.weightKg) : null
  const waterTarget = profile?.waterTargetMl ?? 0

  return (
    <Card>
      <CardTitle
        icon="🥗"
        action={
          <Link to="/nutrition" className="text-sm text-accent hover:underline">
            Дневник →
          </Link>
        }
      >
        Питание
      </CardTitle>
      {!targets && (
        <p className="mb-2 text-sm text-muted">
          Заполните <Link to="/settings" className="text-accent hover:underline">профиль</Link>, чтобы рассчитать норму.
        </p>
      )}
      <div className="space-y-3">
        <Meter label="Калории" value={eatenKcal} target={targets?.kcal} unit="ккал" />
        <Meter label="Белок" value={eatenProtein} target={targets?.proteinG} unit="г" />
        <Meter label="Вода" value={waterMl} target={waterTarget || undefined} unit="мл" />
      </div>
    </Card>
  )
}

function Meter({ label, value, target, unit }: { label: string; value: number; target?: number; unit: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted">
          <span className="font-semibold text-text">{int(value)}</span>
          {target ? ` / ${int(target)}` : ''} {unit}
        </span>
      </div>
      <Progress value={target ? value / target : 0} />
    </div>
  )
}

function SleepCard({ data }: { data: Dashboard }) {
  const { sleep, profile } = data
  return (
    <Card>
      <CardTitle icon="🌙">Сон</CardTitle>
      {sleep ? (
        <>
          <p className="text-lg font-semibold">{formatMinutes(sleep.durationMin)}</p>
          <p className="text-sm text-muted">
            Качество: <span aria-label={`${sleep.quality} из 5`}>{'★'.repeat(sleep.quality)}{'☆'.repeat(5 - sleep.quality)}</span>
            {profile?.sleepTargetMin ? ` · цель ${formatMinutes(profile.sleepTargetMin)}` : ''}
          </p>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">Прошлая ночь не записана.</p>
          <Link to="/sleep/new" className={linkSecondary}>
            Записать
          </Link>
        </>
      )}
    </Card>
  )
}

function ActivitiesCard({ data }: { data: Dashboard }) {
  const { activities } = data
  return (
    <Card>
      <CardTitle
        icon="🏃"
        action={
          <Link to="/cardio/new" className={linkSecondary}>
            + Кардио
          </Link>
        }
      >
        Активности сегодня
      </CardTitle>
      {activities.length === 0 ? (
        <p className="text-sm text-muted">Сегодня активностей пока нет.</p>
      ) : (
        <ul className="divide-y divide-border">
          {activities.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
              <span aria-hidden>{ACTIVITY_ICON[a.type] ?? '•'}</span>
              <span className="font-medium">{ACTIVITY_LABEL_RU[a.type] ?? a.type}</span>
              <span className="ml-auto text-muted">
                {a.durationMin} мин
                {a.distanceKm ? ` · ${km(a.distanceKm)}` : ''}
                {a.kcal ? ` · ${int(a.kcal)} ккал` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function WeightCard({ data }: { data: Dashboard }) {
  const { lastWeight, profile } = data
  const [open, setOpen] = useState(false)
  const current = lastWeight?.weightKg ?? profile?.weightKg
  const target = profile?.targetWeightKg
  const delta = current != null && target != null ? Math.round((current - target) * 10) / 10 : null

  return (
    <Card>
      <CardTitle
        icon="⚖"
        action={
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            + Вес
          </Button>
        }
      >
        Вес
      </CardTitle>
      {current != null ? (
        <>
          <p className="text-lg font-semibold">{kg(current)}</p>
          <p className="text-sm text-muted">
            {lastWeight ? `от ${lastWeight.date.split('-').reverse().join('.')}` : 'из профиля'}
            {delta != null &&
              (delta === 0 ? ' · цель достигнута' : ` · до цели ${delta > 0 ? '−' : '+'}${Math.abs(delta)} кг`)}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">Взвешиваний пока нет.</p>
      )}
      <Link to="/progress" className="mt-2 inline-block text-sm text-accent hover:underline">
        График →
      </Link>
      <WeightSheet open={open} onClose={() => setOpen(false)} placeholder={current} />
    </Card>
  )
}

function WeightSheet({
  open,
  onClose,
  placeholder,
}: {
  open: boolean
  onClose: () => void
  placeholder?: number
}) {
  const [value, setValue] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    const w = Number(value.replace(',', '.'))
    if (!Number.isFinite(w) || w <= 0) return
    const date = today()
    // One weigh-in per day: overwrite today's entry if it exists.
    const existing = await db.weights.where('date').equals(date).first()
    await db.weights.put({ ...existing, id: existing?.id ?? newId(), date, weightKg: w })
    setValue('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Вес сегодня">
      <form onSubmit={save} className="space-y-3">
        <Field label="Вес, кг">
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="20"
            max="400"
            required
            autoFocus
            value={value}
            placeholder={placeholder != null ? String(placeholder) : '80'}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" className="flex-1">
            Сохранить
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
