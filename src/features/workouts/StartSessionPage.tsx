import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { EmptyState, LinkButton, PageHeader, Skeleton } from '../../components/ui'
import { startSession } from './actions'

/**
 * /workouts/start/:programId/:dayId — creates a session from the program day (or reuses the
 * active one) and redirects to it. startSession() is transactional, so StrictMode's double
 * effect cannot create two sessions.
 */
export function StartSessionPage() {
  const { programId = '', dayId = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    startSession(programId, dayId)
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
