import { useMemo, useState } from 'react'
import { Input, Sheet, Skeleton } from '../../components/ui'
import { Icon } from '../../components/icons'
import { MUSCLE_RU, exerciseImageUrl } from '../../data/exercises'
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
      <div className="relative">
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
      {loading && (
        <div className="mt-3 space-y-2">
          <span className="sr-only">Загрузка библиотеки…</span>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      )}
      {!loading && results.length === 0 && <p className="mt-4 text-center text-sm text-muted">Ничего не найдено</p>}
      <ul className="mt-2 divide-y divide-white/[0.06]">
        {results.map((e) => {
          const ru = aliases.get(e.id)?.[0]
          return (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:text-accent"
                onClick={() => {
                  onPick(e, ru ?? e.name)
                  setQuery('')
                  onClose()
                }}
              >
                {e.images[0] ? (
                  <img
                    src={exerciseImageUrl(e.images[0])}
                    alt=""
                    loading="lazy"
                    className="h-10 w-12 shrink-0 rounded-lg bg-white object-contain"
                  />
                ) : (
                  <span aria-hidden className="h-10 w-12 shrink-0 rounded-lg bg-surface-3" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{e.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[ru, e.primaryMuscles.map((m) => MUSCLE_RU[m] ?? m).join(', ')].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Icon name="plus" size={18} className="text-muted" />
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
