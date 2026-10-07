import { Link } from 'react-router'
import { Sheet } from '../../components/ui'
import { ExerciseMedia } from '../../components/ExerciseMedia'
import type { Exercise } from '../../db/types'

/** Full-width technique view: big animation + all instruction steps. */
export function ExerciseTechniqueSheet({
  open,
  onClose,
  title,
  exercise,
}: {
  open: boolean
  onClose: () => void
  title: string
  exercise: Exercise
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ExerciseMedia exercise={exercise} />
      {exercise.instructions.length > 0 && (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          {exercise.instructions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <Link to={`/workouts/exercises/${encodeURIComponent(exercise.id)}`} className="text-sm text-accent">
          Подробнее об упражнении
        </Link>
        <button type="button" className="rounded-xl bg-surface-2 px-4 py-2 text-sm hover:bg-border" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </Sheet>
  )
}
