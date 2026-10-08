import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, EmptyState, IconBadge, LinkButton, PageHeader, SectionHeader, StaggerList } from '../../components/ui'
import { Icon } from '../../components/icons'
import { WorkoutsNav } from '../../components/WorkoutsNav'
import { db } from '../../db'
import type { Program, WorkoutSession } from '../../db/types'
import { WEEKDAY_RU, weekdayIndex } from '../../lib/dates'
import { isStartableDay, weekPrescription } from './calc'
import { getScheduledDay, getWeeklyProgress, scheduleLabel } from './schedule'
import { useActiveProgram, useActiveSession, usePrograms } from './hooks'
import { DAY_TYPE_RU } from './labels'
import { primaryLink, secondaryLink } from './linkStyles'

/** /workouts — today's planned day, active session, program list. */
export function ProgramsPage() {
  const programs = usePrograms()
  const { program, loading } = useActiveProgram()
  const active = useActiveSession()

  return (
    <>
      <PageHeader
        title="Тренировки"
        subtitle="Зал и программы"
        action={
          <LinkButton to="/workouts/exercises" variant="secondary" size="sm" icon="search">
            Упражнения
          </LinkButton>
        }
      />
      <WorkoutsNav />

      {!loading && active !== undefined && <TodayCard program={program} active={active} />}

      <SectionHeader title="Программы" icon="list" />
      {programs && programs.length === 0 && <EmptyState icon="dumbbell" title="Программ пока нет" />}
      <StaggerList as="ul" className="space-y-3">
        {programs?.map((p) => (
          <Link key={p.id} to={`/workouts/programs/${p.id}`} className="group block">
            <Card
              as="div"
              className="flex items-start gap-3 transition-[border-color,transform] group-hover:border-accent/40 group-active:scale-[0.99]"
            >
              <IconBadge name="dumbbell" tone={program?.id === p.id ? 'accent' : 'muted'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold tracking-tight">{p.name}</h3>
                  {program?.id === p.id && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                      Активная
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted tabular-nums">
                  {p.schedule === 'sequential'
                    ? `${p.days.length} дн. по кругу${p.weeks ? ` · ${p.weeks} нед.` : ''}`
                    : `${p.daysPerWeek} дн./нед.`}
                </p>
                <p className="mt-1.5 line-clamp-2 text-sm text-muted">{p.description}</p>
              </div>
              <Icon name="chevron-right" size={18} className="mt-2.5 text-muted" />
            </Card>
          </Link>
        ))}
      </StaggerList>
    </>
  )
}

function TodayCard({ program, active }: { program: Program | null; active: WorkoutSession | null }) {
  const weekday = weekdayIndex()
  const data = useLiveQuery(
    async () => ({
      schedule: program ? await getScheduledDay(db, program) : null,
      weekly: await getWeeklyProgress(db),
    }),
    [program],
  )
  if (!data) return null
  const { schedule, weekly } = data
  const day = schedule?.day
  const cycle = schedule ? scheduleLabel(schedule) : undefined
  const sequential = !!schedule?.sequential
  const extra = weekly.done >= weekly.target

  return (
    <Card variant="accent">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent uppercase">
        <Icon name="calendar" size={14} />
        {sequential ? 'Следующая тренировка' : `Сегодня по плану · ${WEEKDAY_RU[weekday]}`}
      </p>
      {!program && <p className="mt-2 text-sm text-muted">Нет программы.</p>}
      {program && !day && (
        <p className="mt-2 text-sm text-muted">
          В программе «{program.name}» на сегодня нет дня. Выберите день в программе.
        </p>
      )}
      {program && day && (
        <>
          <h2 className="mt-1.5 text-2xl font-bold tracking-tight">{day.name}</h2>
          <p className="text-xs text-muted">
            {[cycle, program.name, DAY_TYPE_RU[day.type]].filter(Boolean).join(' · ')}
          </p>
          {schedule?.isTestWeek && (
            <p className="mt-2 text-sm text-warn">
              Цикл пройден — тестовая неделя: проверь максимумы и начни цикл заново.
            </p>
          )}
          {day.notes && <p className="mt-2 text-sm">{day.notes}</p>}
          {day.exercises.length > 0 && (
            <ul className="mt-3 divide-y divide-white/[0.06] text-sm">
              {day.exercises.map((e, i) => {
                const w = weekPrescription(e, program.weeks ? schedule?.prescriptionWeek : undefined)
                if (w.sets <= 0) return null
                return (
                  <li key={`${e.exerciseId}-${i}`} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate">{e.name}</span>
                    <span className="shrink-0 text-muted tabular-nums">
                      {w.sets} × {w.reps}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
      <p
        className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted tabular-nums"
        data-testid="weekly-progress"
      >
        На этой неделе {weekly.done} из {weekly.target}
        {extra && !active && day && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 font-medium text-accent">Сверх плана</span>
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {active ? (
          <Link to={`/workouts/session/${active.id}`} className={`${primaryLink} min-h-12 basis-full text-base`}>
            <Icon name="play" size={18} />
            Продолжить тренировку
          </Link>
        ) : (
          program &&
          day &&
          isStartableDay(day) && (
            <Link
              to={`/workouts/start/${program.id}/${day.id}`}
              className={`${primaryLink} min-h-12 basis-full text-base`}
            >
              <Icon name="play" size={18} />
              Начать тренировку
            </Link>
          )
        )}
        {active && <span className="self-center text-xs text-muted">Идёт: {active.name}</span>}
        {program && (
          <Link to={`/workouts/programs/${program.id}`} className={`${secondaryLink} min-h-10 flex-1`}>
            Вся программа
          </Link>
        )}
      </div>
    </Card>
  )
}
