import { Button, LinkButton, Sheet } from '../../components/ui'
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
        <ol className="mt-4 space-y-2.5 text-sm">
          {exercise.instructions.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden
                className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent tabular-nums"
              >
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <LinkButton
          to={`/workouts/exercises/${encodeURIComponent(exercise.id)}`}
          variant="ghost"
          iconRight="chevron-right"
          className="text-accent hover:text-accent"
        >
          Подробнее
        </LinkButton>
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </Sheet>
  )
}
