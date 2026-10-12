import { useState } from 'react'
import { Input, Sheet } from '../../components/ui'
import { Icon } from '../../components/icons'
import type { Exercise } from '../../db/types'
import type { MuscleGroupId } from './categories'
import { CategoryBrowser } from './ExerciseBrowser'
import { useExerciseAliases, useExerciseMap } from './hooks'

/** Search the library (or browse by muscle group / equipment) and pick an exercise to add to the session. */
export function ExercisePickerSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (exercise: Exercise, displayName: string) => void
}) {
  const { exercises, loading } = useExerciseMap()
  const aliases = useExerciseAliases()
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<MuscleGroupId | null>(null)

  return (
    <Sheet open={open} onClose={onClose} title="Добавить упражнение">
      <div className="relative mb-3">
        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <Input
          autoFocus
          type="search"
          placeholder="Поиск: bench, присед…"
          aria-label="Поиск упражнения"
          className="pl-10"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <CategoryBrowser
        exercises={exercises}
        aliases={aliases}
        query={query}
        group={group}
        onGroup={setGroup}
        loading={loading}
        trailingIcon="plus"
        onPick={(e) => {
          onPick(e, aliases.get(e.id)?.[0] ?? e.name)
          setQuery('')
          onClose()
        }}
      />
    </Sheet>
  )
}
