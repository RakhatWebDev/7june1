import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, Chip, EmptyState, Input, PageHeader } from '../../components/ui'
import { CATEGORY_RU, EQUIPMENT_RU, MUSCLE_RU, exerciseImageUrl } from '../../data/exercises'
import type { Exercise } from '../../db/types'
import { filterExercises } from './calc'
import { useExerciseAliases, useExerciseMap } from './hooks'

export const PAGE_SIZE = 60

type FilterKey = 'muscle' | 'equipment' | 'category'

/** /workouts/exercises — searchable, filterable library. Filters live in the URL so "back" keeps them. */
export function ExerciseLibraryPage() {
  const { exercises, loading } = useExerciseMap()
  const aliases = useExerciseAliases()
  const [params, setParams] = useSearchParams()
  const [limit, setLimit] = useState(PAGE_SIZE)
  const query = params.get('q') ?? ''
  const muscle = params.get('muscle')
  const equipment = params.get('equipment')
  const category = params.get('category') as Exercise['category'] | null

  const results = useMemo(
    () => filterExercises(exercises, { query, muscle, equipment, category }, aliases),
    [exercises, query, muscle, equipment, category, aliases],
  )

  const setParam = (key: string, value: string | null) => {
    setLimit(PAGE_SIZE)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }
  const toggle = (key: FilterKey, value: string) => setParam(key, params.get(key) === value ? null : value)

  return (
    <>
      <PageHeader title="Упражнения" subtitle={loading ? 'Загрузка…' : `Найдено: ${results.length}`} back="/workouts" />
      <Input
        type="search"
        placeholder="Поиск по названию"
        aria-label="Поиск по названию"
        value={query}
        onChange={(e) => setParam('q', e.target.value)}
      />
      <div className="mt-3 space-y-2">
        <ChipRow label="Мышца">
          {Object.entries(MUSCLE_RU).map(([k, v]) => (
            <Chip key={k} active={muscle === k} onClick={() => toggle('muscle', k)}>
              {v}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Оборудование">
          {Object.entries(EQUIPMENT_RU).map(([k, v]) => (
            <Chip key={k} active={equipment === k} onClick={() => toggle('equipment', k)}>
              {v}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Категория">
          {Object.entries(CATEGORY_RU).map(([k, v]) => (
            <Chip key={k} active={category === k} onClick={() => toggle('category', k)}>
              {v}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {!loading && results.length === 0 && (
        <div className="mt-4">
          <EmptyState title="Ничего не найдено" hint="Измените запрос или сбросьте фильтры." />
        </div>
      )}
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {results.slice(0, limit).map((e) => (
          <ExerciseCard key={e.id} exercise={e} alias={aliases.get(e.id)?.[0]} />
        ))}
      </ul>
      {results.length > limit && (
        <Button variant="secondary" className="mt-4 w-full" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          Показать ещё ({results.length - limit})
        </Button>
      )}
    </>
  )
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1 text-[11px] tracking-wide text-muted uppercase">{label}</div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 whitespace-nowrap [&>*]:shrink-0">{children}</div>
    </div>
  )
}

function ExerciseCard({ exercise: e, alias }: { exercise: Exercise; alias?: string }) {
  return (
    <li>
      <Link
        to={`/workouts/exercises/${encodeURIComponent(e.id)}`}
        className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2 transition hover:border-accent/60"
      >
        {e.images[0] ? (
          <img
            src={exerciseImageUrl(e.images[0])}
            alt=""
            loading="lazy"
            className="h-14 w-16 shrink-0 rounded-xl bg-white object-contain"
          />
        ) : (
          <div className="h-14 w-16 shrink-0 rounded-xl bg-surface-2" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" data-testid="exercise-name">
            {e.name}
          </p>
          {alias && <p className="truncate text-xs text-accent">{alias}</p>}
          <p className="truncate text-xs text-muted">
            {[e.primaryMuscles.map((m) => MUSCLE_RU[m] ?? m).join(', '), e.equipment && (EQUIPMENT_RU[e.equipment] ?? e.equipment)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </Link>
    </li>
  )
}
