import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { ExerciseMedia } from '../../components/ExerciseMedia'
import { CATEGORY_RU, EQUIPMENT_RU, MUSCLE_RU, useExercise } from '../../data/exercises'
import { bestByExercise, exerciseHistory, fmtKg, formatPerformance } from './calc'
import { useExerciseAliases, useSessions } from './hooks'
import { FORCE_RU, LEVEL_RU, MECHANIC_RU, formatSessionDate } from './labels'

/** /workouts/exercises/:id — demo, instructions, muscles, my history and records. */
export function ExerciseDetailPage() {
  const { id = '' } = useParams()
  const { exercise, loading, error } = useExercise(id)
  const aliases = useExerciseAliases()
  const sessions = useSessions()

  const history = useMemo(() => exerciseHistory(sessions ?? [], id, 10), [sessions, id])
  const best = useMemo(() => bestByExercise(sessions ?? []).get(id), [sessions, id])

  if (loading) return <PageHeader title="Упражнение" back="/workouts/exercises" />
  if (!exercise)
    return (
      <>
        <PageHeader title="Упражнение" back="/workouts/exercises" />
        <EmptyState title="Упражнение не найдено" hint={error ?? id} />
      </>
    )

  const alias = aliases.get(exercise.id)?.[0]
  const muscles = (list: string[]) => list.map((m) => MUSCLE_RU[m] ?? m).join(', ') || '—'
  const facts: [string, string][] = [
    ['Основные мышцы', muscles(exercise.primaryMuscles)],
    ['Вспомогательные', muscles(exercise.secondaryMuscles)],
    ['Уровень', LEVEL_RU[exercise.level] ?? exercise.level],
    ['Оборудование', exercise.equipment ? (EQUIPMENT_RU[exercise.equipment] ?? exercise.equipment) : '—'],
    ['Категория', CATEGORY_RU[exercise.category] ?? exercise.category],
  ]
  if (exercise.mechanic) facts.push(['Тип', MECHANIC_RU[exercise.mechanic]])
  if (exercise.force) facts.push(['Усилие', FORCE_RU[exercise.force]])

  return (
    <>
      <PageHeader title={exercise.name} subtitle={alias} back="/workouts/exercises" />
      <ExerciseMedia exercise={exercise} />

      <Card className="mt-4">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {exercise.instructions.length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-2 font-semibold">Техника</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {exercise.instructions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Card>
      )}

      <h2 className="mt-6 mb-2 font-semibold">Мои рекорды</h2>
      {best ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Макс. вес"
            value={`${fmtKg(best.maxWeightKg)} кг`}
            sub={best.maxWeightDate ? formatSessionDate(best.maxWeightDate) : undefined}
          />
          <Stat
            label="Расчётный 1RM"
            value={`${fmtKg(Math.round(best.best1RM * 10) / 10)} кг`}
            sub={best.best1RMDate ? formatSessionDate(best.best1RMDate) : undefined}
          />
        </div>
      ) : (
        <p className="text-sm text-muted">Пока нет выполненных подходов.</p>
      )}

      <h2 className="mt-6 mb-2 font-semibold">История</h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted">Вы ещё не выполняли это упражнение.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => (
            <li key={h.sessionId}>
              <Link
                to={`/workouts/session/${h.sessionId}`}
                className="block rounded-2xl border border-border bg-surface p-3 hover:border-accent/60"
              >
                <span className="block text-xs text-muted">
                  {formatSessionDate(h.startedAt)} · {h.sessionName}
                </span>
                <span className="block text-sm">{formatPerformance(h.sets)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
