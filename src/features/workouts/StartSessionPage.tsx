import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { EmptyState, PageHeader } from '../../components/ui'
import { startSession } from './actions'
import { secondaryLink } from './linkStyles'

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
          title="Не удалось начать тренировку"
          hint={error}
          action={
            <Link to="/workouts" className={secondaryLink}>
              К программам
            </Link>
          }
        />
      ) : (
        <p className="text-muted">Создаём тренировку…</p>
      )}
    </>
  )
}
