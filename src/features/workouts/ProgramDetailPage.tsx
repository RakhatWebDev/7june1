import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { db } from '../../db'
import type { ProgramDay } from '../../db/types'
import { WEEKDAY_SHORT_RU, weekdayIndex } from '../../lib/dates'
import { setActiveProgram } from './actions'
import { isStartableDay } from './calc'
import { useActiveProgram } from './hooks'
import { DAY_TYPE_RU, restLabel } from './labels'
import { primaryLink } from './linkStyles'

/** /workouts/programs/:id — days with exercises; start a specific day. */
export function ProgramDetailPage() {
  const { id = '' } = useParams()
  const program = useLiveQuery(async () => (await db.programs.get(id)) ?? null, [id])
  const { program: activeProgram } = useActiveProgram()

  if (program === undefined) return <PageHeader title="Программа" back="/workouts" />
  if (program === null)
    return (
      <>
        <PageHeader title="Программа" back="/workouts" />
        <EmptyState title="Программа не найдена" />
      </>
    )

  const isActive = activeProgram?.id === program.id
  const todayIdx = weekdayIndex()
  return (
    <>
      <PageHeader title={program.name} subtitle={`${program.daysPerWeek} дн./нед.`} back="/workouts" />
      <Card>
        <p className="text-sm">{program.description}</p>
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
      </Card>
      <ul className="mt-4 space-y-3">
        {program.days.map((day) => (
          <li key={day.id}>
            <DayCard programId={program.id} day={day} isToday={day.weekday === todayIdx} />
          </li>
        ))}
      </ul>
    </>
  )
}

function DayCard({ programId, day, isToday }: { programId: string; day: ProgramDay; isToday: boolean }) {
  return (
    <Card as="div" className={isToday ? 'border-accent/50' : ''}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            {day.weekday != null && WEEKDAY_SHORT_RU[day.weekday]} · {DAY_TYPE_RU[day.type]}
            {isToday && <span className="ml-1 text-accent">· сегодня</span>}
          </p>
          <h2 className="font-semibold">{day.name}</h2>
        </div>
      </div>
      {day.notes && <p className="mt-2 text-sm text-muted">{day.notes}</p>}
      {day.exercises.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {day.exercises.map((e, i) => (
            <li key={`${e.exerciseId}-${i}`}>
              <Link
                to={`/workouts/exercises/${encodeURIComponent(e.exerciseId)}`}
                className="flex items-start justify-between gap-3 py-2 hover:text-accent"
              >
                <span className="min-w-0">
                  <span className="block text-sm">{e.name}</span>
                  <span className="block text-xs text-muted">
                    {[e.intensity, restLabel(e.restSec), e.notes].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium">
                  {e.sets} × {e.reps}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {isStartableDay(day) && (
        <Link to={`/workouts/start/${programId}/${day.id}`} className={`${primaryLink} mt-3 w-full`}>
          Начать этот день
        </Link>
      )}
    </Card>
  )
}
