import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { EmptyState, LinkButton, PageHeader, Skeleton } from '../../components/ui'
import { db } from '../../db'
import type { Exercise } from '../../db/types'
import { loadExercises } from '../../data/exercises'
import { startSession, StartSessionError } from './actions'
import { getScheduledDay } from './schedule'

/** Library by id for auto-regulation; never blocks the start for long (offline / slow network). */
async function libraryMap(timeoutMs = 1500): Promise<Map<string, Exercise>> {
  const list = await Promise.race([
    loadExercises().catch(() => [] as Exercise[]),
    new Promise<Exercise[]>((resolve) => setTimeout(() => resolve([]), timeoutMs)),
  ])
  return new Map(list.map((e) => [e.id, e]))
}

/** `dayId === 'next'` resolves the scheduled day (weekday or next in the rotation). */
async function resolveDayId(programId: string, dayId: string): Promise<string> {
  if (dayId !== 'next') return dayId
  const program = await db.programs.get(programId)
  if (!program) throw new StartSessionError('Программа не найдена')
  const s = await getScheduledDay(db, program)
  if (!s.day) throw new StartSessionError('На сегодня в программе нет дня')
  return s.day.id
}

/**
 * /workouts/start/:programId/:dayId — creates a session from the program day (or reuses the
 * active one) and redirects to it. `:dayId` may be `next` (the scheduled day). startSession() is transactional, so StrictMode's double
 * effect cannot create two sessions.
 */
export function StartSessionPage() {
  const { programId = '', dayId = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([resolveDayId(programId, dayId), libraryMap()])
      .then(([id, library]) => startSession(programId, id, undefined, undefined, library))
      .then((id) => {
        if (alive) void navigate(`/workouts/session/${id}`, { replace: true })
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
    }
  }, [programId, dayId, navigate])

  return (
    <>
      <PageHeader title="Тренировка" back="/workouts" />
      {error ? (
        <EmptyState
          icon="dumbbell"
          title="Не удалось начать тренировку"
          hint={error}
          action={
            <LinkButton to="/workouts" variant="secondary" icon="list">
              К программам
            </LinkButton>
          }
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">Создаём тренировку…</p>
          <Skeleton className="mb-4 h-14" rounded="rounded-2xl" />
          <Skeleton className="h-72" rounded="rounded-3xl" />
        </>
      )}
    </>
  )
}
