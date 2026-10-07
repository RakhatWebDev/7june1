import { Link } from 'react-router'
import { Card, EmptyState, PageHeader } from '../../components/ui'
import type { Program, WorkoutSession } from '../../db/types'
import { WEEKDAY_RU, weekdayIndex } from '../../lib/dates'
import { isStartableDay, scheduledDay } from './calc'
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
      <PageHeader title="Зал" subtitle="Программы и тренировки" />
      <nav className="mb-4 grid grid-cols-2 gap-2">
        <Link to="/workouts/history" className={secondaryLink}>
          История
        </Link>
        <Link to="/workouts/exercises" className={secondaryLink}>
          Упражнения
        </Link>
      </nav>

      {!loading && active !== undefined && <TodayCard program={program} active={active} />}

      <h2 className="mt-6 mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Программы</h2>
      {programs && programs.length === 0 && <EmptyState title="Программ пока нет" />}
      <ul className="space-y-3">
        {programs?.map((p) => (
          <li key={p.id}>
            <Link to={`/workouts/programs/${p.id}`} className="block">
              <Card as="div" className="transition hover:border-accent/60">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{p.name}</h3>
                  {program?.id === p.id && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">Активная</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">{p.daysPerWeek} дн./нед.</p>
                <p className="mt-2 line-clamp-2 text-sm text-muted">{p.description}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function TodayCard({ program, active }: { program: Program | null; active: WorkoutSession | null }) {
  const weekday = weekdayIndex()
  const day = program ? scheduledDay(program, weekday) : undefined

  return (
    <Card className="border-accent/40">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">Сегодня по плану · {WEEKDAY_RU[weekday]}</p>
      {!program && <p className="mt-2 text-sm text-muted">Нет программы.</p>}
      {program && !day && (
        <p className="mt-2 text-sm text-muted">
          В программе «{program.name}» на сегодня нет дня. Выберите день в программе.
        </p>
      )}
      {program && day && (
        <>
          <h2 className="mt-1 text-xl font-bold">{day.name}</h2>
          <p className="text-xs text-muted">
            {program.name} · {DAY_TYPE_RU[day.type]}
          </p>
          {day.notes && <p className="mt-2 text-sm">{day.notes}</p>}
          {day.exercises.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {day.exercises.map((e, i) => (
                <li key={`${e.exerciseId}-${i}`} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{e.name}</span>
                  <span className="shrink-0 text-muted">
                    {e.sets} × {e.reps}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {active ? (
          <Link to={`/workouts/session/${active.id}`} className={primaryLink}>
            Продолжить тренировку
          </Link>
        ) : (
          program &&
          day &&
          isStartableDay(day) && (
            <Link to={`/workouts/start/${program.id}/${day.id}`} className={primaryLink}>
              Начать тренировку
            </Link>
          )
        )}
        {active && <span className="self-center text-xs text-muted">Идёт: {active.name}</span>}
        {program && (
          <Link to={`/workouts/programs/${program.id}`} className={secondaryLink}>
            Вся программа
          </Link>
        )}
      </div>
    </Card>
  )
}
