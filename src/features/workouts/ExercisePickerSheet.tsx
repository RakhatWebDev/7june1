import { useMemo, useState } from 'react'
import { Input, Sheet } from '../../components/ui'
import { MUSCLE_RU } from '../../data/exercises'
import type { Exercise } from '../../db/types'
import { filterExercises } from './calc'
import { useExerciseAliases, useExerciseMap } from './hooks'

const MAX_RESULTS = 40

/** Search the library and pick an exercise to add to the session. */
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
  const results = useMemo(
    () => filterExercises(exercises, { query }, aliases).slice(0, MAX_RESULTS),
    [exercises, query, aliases],
  )

  return (
    <Sheet open={open} onClose={onClose} title="Добавить упражнение">
      <Input
        autoFocus
        type="search"
        placeholder="Поиск: bench, присед…"
        aria-label="Поиск упражнения"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <p className="mt-3 text-sm text-muted">Загрузка библиотеки…</p>}
      {!loading && results.length === 0 && <p className="mt-3 text-sm text-muted">Ничего не найдено</p>}
      <ul className="mt-3 divide-y divide-border">
        {results.map((e) => {
          const ru = aliases.get(e.id)?.[0]
          return (
            <li key={e.id}>
              <button
                type="button"
                className="w-full py-2 text-left hover:text-accent"
                onClick={() => {
                  onPick(e, ru ?? e.name)
                  setQuery('')
                  onClose()
                }}
              >
                <span className="block text-sm">{e.name}</span>
                <span className="block text-xs text-muted">
                  {[ru, e.primaryMuscles.map((m) => MUSCLE_RU[m] ?? m).join(', ')].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
