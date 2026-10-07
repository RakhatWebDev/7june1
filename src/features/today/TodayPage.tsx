import { useState, type FormEvent, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { db } from '../../db'
import { formatMinutes, today, weekdayIndex } from '../../lib/dates'
import { int, kg, km } from '../../lib/format'
import { newId } from '../../lib/id'
import {
  Button,
  Card,
  CountUp,
  Field,
  Input,
  Progress,
  Ring,
  Sheet,
  StaggerList,
  StatTile,
  type Tone,
} from '../../components/ui'
import { Icon, type IconName } from '../../components/icons'
import { computeTargets } from '../nutrition/calc'
import { UpcomingCard } from '../calendar/UpcomingCard'
import { HabitsTodayCard, ReadingTodayCard } from '../growth/cards'
import { MoodCheckinCard, MindTodayCard } from '../mind/cards'
import { FinanceTodayCard } from '../finance/cards'
import { GoalsFocusCard, WeeklyReviewCard } from '../goals/cards'
import {
  ACTIVITY_LABEL_RU,
  greeting,
  pickProgram,
  scheduledDay,
  sessionLocalDate,
  sessionVolume,
} from './calc'

const linkPrimary =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-base font-semibold text-bg shadow-[0_12px_28px_-14px_rgb(180_240_60/0.9)] transition-[background-color,transform] hover:bg-accent-strong active:scale-[0.98] motion-reduce:active:scale-100'
const linkSecondary =
  'inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.06] bg-surface-2 px-4 text-sm font-medium text-text transition-[background-color,transform] hover:bg-surface-3 active:scale-[0.98] motion-reduce:active:scale-100'
const roundAction =
  'grid size-8 place-items-center rounded-full transition active:scale-95 motion-reduce:active:scale-100'

/** Loads everything the dashboard needs for the given local day in one live query. */
async function loadDashboard(day: string) {
  const since = new Date(Date.now() - 36 * 3600_000).toISOString()
  const [
    profile,
    programs,
    activeSetting,
    activeSession,
    recentSessions,
    foodEntries,
    water,
    sleep,
    activities,
    lastWeight,
  ] = await Promise.all([
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

/** Minutes of activity that close the «Активность» ring when there was no gym session. */
const ACTIVE_MINUTES_GOAL = 30

export function TodayPage() {
  const day = today()
  const data = useLiveQuery(() => loadDashboard(day), [day])
  const [now] = useState(() => new Date())
  const name = data?.profile?.name?.trim()

  return (
    <>
      <header className="mb-5 flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-accent),var(--color-info))] text-lg font-bold text-bg shadow-[0_6px_18px_-8px_rgb(180_240_60/0.7)]"
        >
          {name ? name.charAt(0).toUpperCase() : <Icon name="user" size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            {capitalize(format(now, 'EEEE, d MMMM', { locale: ru }))}
          </p>
          <h1 className="truncate text-[22px] leading-tight font-bold tracking-tight">
            {greeting(now.getHours())}
            {name ? `, ${name}` : ''}
          </h1>
        </div>
        <Link
          to="/settings"
          aria-label="Настройки"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-white/[0.06] bg-surface-2 text-muted transition-colors hover:text-text"
        >
          <Icon name="settings" size={20} />
        </Link>
      </header>
      {data && (
        <StaggerList className="flex flex-col gap-3 [&>*:empty]:hidden">
          <RingsCard key="rings" data={data} />
          <MoodCheckinCard key="mood" variant="strip" />
          <WorkoutCard key="workout" data={data} />
          <StaggerList key="tiles" className="grid grid-cols-2 gap-3" delay={0.1}>
            <SleepTile key="sleep" data={data} />
            <WeightTile key="weight" data={data} />
            <ActivitiesTile key="activities" data={data} />
            <FinanceTodayCard key="finance" compact />
            <MindTodayCard key="mind" compact />
            <ReadingTodayCard key="reading" compact />
          </StaggerList>
          <HabitsTodayCard key="habits" layout="bubbles" />
          <GoalsFocusCard key="goals" />
          <WeeklyReviewCard key="review" />
          <UpcomingCard key="upcoming" />
        </StaggerList>
      )}
    </>
  )
}

/* ----------------------------- Rings ------------------------------ */

function RingsCard({ data }: { data: Dashboard }) {
  const { profile, foodEntries, water, lastWeight, finishedToday, activities } = data
  const eatenKcal = foodEntries.reduce((a, e) => a + (e.kcal || 0), 0)
  const eatenProtein = foodEntries.reduce((a, e) => a + (e.proteinG || 0), 0)
  const waterMl = water.reduce((a, w) => a + (w.ml || 0), 0)
  const targets = profile ? computeTargets(profile, lastWeight?.weightKg ?? profile.weightKg) : null
  const waterTarget = profile?.waterTargetMl ?? 0
  const activeMin = activities.reduce((a, x) => a + (x.durationMin || 0), 0)
  const workoutDone = finishedToday.length > 0

  return (
    <Card variant="elevated" className="pb-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold tracking-tight">Кольца дня</h2>
        <Link
          to="/nutrition"
          className="-mr-1 flex items-center rounded-lg px-1 text-sm font-medium text-accent hover:underline"
        >
          Дневник
          <Icon name="chevron-right" size={16} />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <RingStat
          tone="warn"
          icon="flame"
          label="Калории"
          value={eatenKcal}
          target={targets?.kcal}
          unit="ккал"
          delay={0}
        />
        <RingStat
          tone="info"
          icon="droplet"
          label="Вода"
          value={waterMl}
          target={waterTarget || undefined}
          unit="мл"
          delay={0.12}
        />
        <RingStat
          tone="accent"
          icon="activity"
          label="Активность"
          value={activeMin}
          target={ACTIVE_MINUTES_GOAL}
          unit="мин"
          delay={0.24}
          done={workoutDone}
        />
      </div>
      <div className="mt-2.5 border-t border-white/[0.06] pt-2.5">
        {targets ? (
          <MacroLine label="Белок" value={eatenProtein} target={targets.proteinG} unit="г" />
        ) : (
          <p className="text-sm text-muted">
            Заполните{' '}
            <Link to="/settings" className="text-accent hover:underline">
              профиль
            </Link>
            , чтобы рассчитать норму.
          </p>
        )}
      </div>
    </Card>
  )
}

function RingStat({
  tone,
  icon,
  label,
  value,
  target,
  unit,
  delay,
  done = false,
}: {
  tone: Tone
  icon: IconName
  label: string
  value: number
  target?: number
  unit: string
  delay: number
  done?: boolean
}) {
  const progress = done ? 1 : target ? value / target : 0
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <Ring
        value={progress}
        size={78}
        stroke={9}
        tone={tone}
        delay={delay}
        aria-label={`${label}: ${done ? 'тренировка выполнена' : `${int(value)}${target ? ` из ${int(target)}` : ''} ${unit}`}`}
      >
        <span className={`flex flex-col items-center ${done ? 'text-accent' : ''}`}>
          <Icon name={done ? 'check' : icon} size={14} className={done ? '' : TONE_ICON[tone]} />
          {done ? (
            <span className="mt-0.5 text-[13px] font-semibold">Готово</span>
          ) : (
            <CountUp
              value={value}
              delay={delay}
              format={int}
              className="mt-0.5 text-[17px] leading-none font-semibold tracking-tight"
            />
          )}
        </span>
      </Ring>
      <span className="mt-1.5 text-[13px] font-medium">{label}</span>
      <span className="w-full truncate text-[11px] text-muted tabular-nums">
        {done ? 'тренировка в зале' : target ? `из ${int(target)} ${unit}` : `${unit} · нет нормы`}
      </span>
    </div>
  )
}

const TONE_ICON: Partial<Record<Tone, string>> = {
  warn: 'text-warn',
  info: 'text-info',
  accent: 'text-accent',
}

function MacroLine({
  label,
  value,
  target,
  unit,
}: {
  label: string
  value: number
  target: number
  unit: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[13px] text-muted">{label}</span>
      <Progress value={value / target} tone="warn" className="h-1.5" />
      <span className="shrink-0 text-[13px] text-muted tabular-nums">
        <span className="font-semibold text-text">{int(value)}</span> / {int(target)} {unit}
      </span>
    </div>
  )
}

/* ---------------------------- Workout ----------------------------- */

function WorkoutCard({ data }: { data: Dashboard }) {
  const { program, activeSession, finishedToday } = data
  const day = scheduledDay(program, weekdayIndex())

  let title: ReactNode = null
  let meta: ReactNode = null
  let cta: ReactNode = null
  let tone: Tone = 'accent'
  if (activeSession) {
    const done = activeSession.exercises.reduce(
      (a, e) => a + e.sets.filter((s) => s.done).length,
      0,
    )
    const total = activeSession.exercises.reduce((a, e) => a + e.sets.length, 0)
    title = activeSession.name
    meta = (
      <>
        <p className="text-sm text-muted">
          Тренировка идёт · подходов {done} из {total}
        </p>
        <Progress value={total ? done / total : 0} className="mt-3 h-1.5" />
      </>
    )
    cta = (
      <Link
        to={`/workouts/session/${activeSession.id}`}
        className={`${linkPrimary} min-h-12 w-full`}
      >
        <Icon name="play" size={18} />
        Продолжить
      </Link>
    )
  } else if (finishedToday.length > 0) {
    const volume = finishedToday.reduce((a, s) => a + sessionVolume(s), 0)
    const last = finishedToday[finishedToday.length - 1]
    title = (
      <span className="flex items-center gap-2 text-accent">
        <Icon name="check" size={24} strokeWidth={2.25} />
        Выполнено
      </span>
    )
    meta = (
      <p className="text-sm text-muted">
        {finishedToday.map((s) => s.name).join(', ')} · объём {int(volume)} кг
      </p>
    )
    cta = (
      <Link to={`/workouts/session/${last.id}`} className={`${linkSecondary} min-h-11 w-full`}>
        Открыть
      </Link>
    )
  } else if (program && day) {
    title = day.name
    if (day.type === 'rest') {
      tone = 'violet'
      meta = <p className="text-sm text-muted">{day.notes ?? 'День отдыха.'}</p>
    } else {
      meta = (
        <p className="text-sm text-muted">
          {program.name} · {day.exercises.length} упр.
        </p>
      )
      cta = (
        <Link
          to={`/workouts/start/${program.id}/${day.id}`}
          className={`${linkPrimary} min-h-12 w-full`}
        >
          <Icon name="play" size={18} />
          Начать
        </Link>
      )
    }
  } else {
    tone = 'muted'
    meta = (
      <p className="text-sm text-muted">
        {program ? 'На сегодня по расписанию тренировки нет.' : 'Программа не выбрана.'}
      </p>
    )
    cta = (
      <Link to="/workouts" className={`${linkSecondary} min-h-11 w-full`}>
        К программам
      </Link>
    )
  }

  return (
    <Card variant="accent" tone={tone === 'muted' ? undefined : tone} className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2
          className={`flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase ${tone === 'violet' ? 'text-violet' : 'text-accent'}`}
        >
          <Icon name={tone === 'violet' ? 'moon' : 'dumbbell'} size={15} />
          Тренировка дня
        </h2>
        <Link
          to="/workouts"
          aria-label="Все тренировки"
          className="-mr-1 rounded-lg p-1 text-muted hover:text-text"
        >
          <Icon name="chevron-right" size={18} />
        </Link>
      </div>
      {title && <p className="text-2xl leading-tight font-bold tracking-tight">{title}</p>}
      <div className="mt-1">{meta}</div>
      {cta && <div className="mt-3.5">{cta}</div>}
    </Card>
  )
}

/* ----------------------------- Tiles ------------------------------ */

function SleepTile({ data }: { data: Dashboard }) {
  const { sleep, profile } = data
  return (
    <StatTile
      icon="moon"
      tone="violet"
      label="Сон"
      to="/sleep"
      value={sleep ? formatMinutes(sleep.durationMin) : '—'}
      sub={
        sleep ? (
          <>
            <span aria-label={`${sleep.quality} из 5`} className="text-violet">
              {'★'.repeat(sleep.quality)}
              <span className="text-surface-3">{'★'.repeat(5 - sleep.quality)}</span>
            </span>
            {profile?.sleepTargetMin ? ` · цель ${formatMinutes(profile.sleepTargetMin)}` : ''}
          </>
        ) : (
          'Нет записи за ночь'
        )
      }
      action={
        sleep ? undefined : (
          <Link
            to="/sleep/new"
            aria-label="Записать"
            className={`${roundAction} bg-violet/15 text-violet`}
          >
            <Icon name="plus" size={16} />
          </Link>
        )
      }
    />
  )
}

function WeightTile({ data }: { data: Dashboard }) {
  const { lastWeight, profile } = data
  const [open, setOpen] = useState(false)
  const current = lastWeight?.weightKg ?? profile?.weightKg
  const target = profile?.targetWeightKg
  const delta = current != null && target != null ? Math.round((current - target) * 10) / 10 : null

  return (
    <>
      <StatTile
        icon="scale"
        tone="accent"
        label="Вес"
        to="/progress"
        value={current != null ? kg(current) : '—'}
        sub={
          current == null
            ? 'Пока нет взвешиваний'
            : delta != null
              ? delta === 0
                ? 'цель достигнута'
                : `до цели ${delta > 0 ? '−' : '+'}${Math.abs(delta)} кг`
              : lastWeight
                ? `от ${lastWeight.date.split('-').reverse().join('.')}`
                : 'из профиля'
        }
        action={
          <button
            type="button"
            aria-label="Добавить вес"
            onClick={() => setOpen(true)}
            className={`${roundAction} bg-accent/15 text-accent`}
          >
            <Icon name="plus" size={16} />
          </button>
        }
      />
      <WeightSheet open={open} onClose={() => setOpen(false)} placeholder={current} />
    </>
  )
}

function ActivitiesTile({ data }: { data: Dashboard }) {
  const { activities } = data
  const minutes = activities.reduce((a, x) => a + (x.durationMin || 0), 0)
  return (
    <StatTile
      icon="run"
      tone="info"
      label="Кардио"
      to="/cardio"
      value={activities.length ? minutes : '—'}
      unit={activities.length ? 'мин' : undefined}
      sub={
        activities.length === 0 ? (
          'Сегодня пока пусто'
        ) : (
          <ul>
            {activities.slice(0, 1).map((a) => (
              <li key={a.id} className="truncate">
                <span className="text-text">{ACTIVITY_LABEL_RU[a.type] ?? a.type}</span>
                {' · '}
                <span>
                  {a.durationMin} мин
                  {a.distanceKm ? ` · ${km(a.distanceKm)}` : ''}
                  {a.kcal ? ` · ${int(a.kcal)} ккал` : ''}
                </span>
              </li>
            ))}
          </ul>
        )
      }
      action={
        <Link
          to="/cardio/new"
          aria-label="Добавить кардио"
          className={`${roundAction} bg-info/15 text-info`}
        >
          <Icon name="plus" size={16} />
        </Link>
      }
    />
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
