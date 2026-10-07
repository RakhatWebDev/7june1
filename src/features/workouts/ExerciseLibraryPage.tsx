import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, Chip, EmptyState, Input, PageHeader, Skeleton, StaggerList, type Tone } from '../../components/ui'
import { Icon } from '../../components/icons'
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
  const hasFilters = !!(muscle || equipment || category || query)

  return (
    <>
      <PageHeader title="Упражнения" subtitle={loading ? 'Загрузка…' : `Найдено: ${results.length}`} back="/workouts" />
      <div className="relative">
        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          placeholder="Поиск по названию"
          aria-label="Поиск по названию"
          className="rounded-2xl pl-10"
          value={query}
          onChange={(e) => setParam('q', e.target.value)}
        />
      </div>
      <div className="mt-4 space-y-3">
        <ChipRow label="Мышца">
          {Object.entries(MUSCLE_RU).map(([k, v]) => (
            <Chip key={k} tone="accent" active={muscle === k} onClick={() => toggle('muscle', k)}>
              {v}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Оборудование">
          {Object.entries(EQUIPMENT_RU).map(([k, v]) => (
            <Chip key={k} tone="info" active={equipment === k} onClick={() => toggle('equipment', k)}>
              {v}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Категория">
          {Object.entries(CATEGORY_RU).map(([k, v]) => (
            <Chip key={k} tone={CATEGORY_TONE[k] ?? 'violet'} active={category === k} onClick={() => toggle('category', k)}>
              {v}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {loading && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="library-skeleton">
          <span className="sr-only">Загрузка библиотеки…</span>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-3xl border border-white/[0.06] bg-surface p-2">
              <Skeleton className="h-14 w-16 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/4" rounded="rounded-md" />
                <Skeleton className="h-3 w-1/2" rounded="rounded-md" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon="search"
            title="Ничего не найдено"
            hint="Измените запрос или сбросьте фильтры."
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" icon="x" onClick={() => setParams({}, { replace: true })}>
                  Сбросить фильтры
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      <StaggerList as="ul" className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {results.slice(0, limit).map((e) => (
          <ExerciseCard key={e.id} exercise={e} alias={aliases.get(e.id)?.[0]} />
        ))}
      </StaggerList>
      {results.length > limit && (
        <Button variant="secondary" className="mt-4 w-full" icon="chevron-down" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          Показать ещё ({results.length - limit})
        </Button>
      )}
    </>
  )
}

const CATEGORY_TONE: Record<string, Tone> = {
  strength: 'accent',
  powerlifting: 'accent',
  'olympic weightlifting': 'accent',
  strongman: 'amber',
  cardio: 'info',
  plyometrics: 'info',
  stretching: 'violet',
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1.5 px-0.5 text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 whitespace-nowrap [&>*]:shrink-0">
        {children}
      </div>
    </div>
  )
}

function ExerciseCard({ exercise: e, alias }: { exercise: Exercise; alias?: string }) {
  return (
    <Link
      to={`/workouts/exercises/${encodeURIComponent(e.id)}`}
      className="group flex items-center gap-3 rounded-3xl border border-white/[0.06] bg-surface bg-[image:var(--gradient-surface)] p-2 pr-3 shadow-[var(--shadow-card)] transition-[border-color,transform] duration-150 hover:border-accent/40 active:scale-[0.99] motion-reduce:active:scale-100"
    >
      {e.images[0] ? (
        <img
          src={exerciseImageUrl(e.images[0])}
          alt=""
          loading="lazy"
          className="h-14 w-16 shrink-0 rounded-2xl bg-white object-contain"
        />
      ) : (
        <div className="grid h-14 w-16 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
          <Icon name="dumbbell" size={22} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight" data-testid="exercise-name">
          {e.name}
        </p>
        {alias && <p className="truncate text-xs font-medium text-accent">{alias}</p>}
        <p className="truncate text-xs text-muted">
          {[e.primaryMuscles.map((m) => MUSCLE_RU[m] ?? m).join(', '), e.equipment && (EQUIPMENT_RU[e.equipment] ?? e.equipment)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <Icon name="chevron-right" size={18} className="shrink-0 text-muted transition-colors group-hover:text-accent" />
    </Link>
  )
}
