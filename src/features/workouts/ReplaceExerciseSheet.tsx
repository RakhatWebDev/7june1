import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Input, SegmentedControl, Sheet, Skeleton } from '../../components/ui'
import { Icon } from '../../components/icons'
import { db } from '../../db'
import type { Exercise, WorkoutSession } from '../../db/types'
import { EQUIPMENT_RU, exerciseImageUrl } from '../../data/exercises'
import { replaceExercise } from './actions'
import { rankAlternatives } from './alternatives'
import { filterExercises, occurrenceIndex } from './calc'
import { useExerciseAliases, useExerciseMap } from './hooks'
import { applyDayOverrides, getOverrides, setOverride } from './overrides'

const MAX_SEARCH = 30

/**
 * «Альтернативы для <name>»: ranked suggestions (curated for main lifts, then by muscles / force / mechanic /
 * equipment) plus a search over the whole library. Replaces only today, or in the program as well.
 */
export function ReplaceExerciseSheet({
  open,
  onClose,
  session,
  exIdx,
}: {
  open: boolean
  onClose: () => void
  session: WorkoutSession
  exIdx: number
}) {
  const exercise = session.exercises[exIdx]
  const { map, exercises, loading } = useExerciseMap()
  const aliases = useExerciseAliases()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'today' | 'program'>('today')

  // Index of this exercise in the program day (with existing overrides), for «Заменить в программе».
  const programIndex = useLiveQuery(async () => {
    if (!open || !session.programId || !session.programDayId || !exercise) return null
    const program = await db.programs.get(session.programId)
    const day = program?.days.find((d) => d.id === session.programDayId)
    if (!day) return null
    const overrides = await getOverrides(db, session.programId)
    const effective = applyDayOverrides(day, overrides[day.id], () => true)
    const k = occurrenceIndex(session.exercises, exIdx)
    const idx = effective.exercises
      .map((e, i) => (e.exerciseId === exercise.exerciseId ? i : -1))
      .filter((i) => i >= 0)[k]
    return idx ?? null
  }, [open, session.programId, session.programDayId, exercise?.exerciseId, exIdx])

  const current = exercise ? map.get(exercise.exerciseId) : undefined
  const suggestions = useMemo(() => (current ? rankAlternatives(current, exercises, 8) : []), [current, exercises])
  const results = useMemo(
    () => (query.trim() ? filterExercises(exercises, { query }, aliases).slice(0, MAX_SEARCH) : []),
    [exercises, query, aliases],
  )
  if (!exercise) return null

  const pick = async (e: Exercise) => {
    const name = aliases.get(e.id)?.[0] ?? e.name
    await replaceExercise(session.id, exIdx, { exerciseId: e.id, name }, db, map)
    if (scope === 'program' && programIndex != null && session.programId && session.programDayId)
      await setOverride(db, session.programId, session.programDayId, programIndex, { exerciseId: e.id, name })
    setQuery('')
    onClose()
  }

  const list = query.trim() ? results : suggestions
  return (
    <Sheet open={open} onClose={onClose} title={`Альтернативы для ${exercise.name}`}>
      {programIndex != null && (
        <SegmentedControl
          aria-label="Где заменить"
          size="sm"
          className="mb-3"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'today', label: 'Только сегодня' },
            { value: 'program', label: 'Заменить в программе' },
          ]}
        />
      )}
      <div className="relative">
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <Input
          type="search"
          placeholder="Поиск по всей библиотеке"
          aria-label="Поиск замены"
          className="pl-10"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="mt-3 text-xs font-medium tracking-wide text-muted uppercase">
        {query.trim() ? 'Результаты поиска' : 'Похожие упражнения'}
      </p>
      {loading && (
        <div className="mt-2 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      )}
      {!loading && list.length === 0 && <p className="mt-3 text-center text-sm text-muted">Ничего не найдено</p>}
      <ul className="mt-1 divide-y divide-white/[0.06]" data-testid="alternatives">
        {list.map((e) => {
          const ru = aliases.get(e.id)?.[0]
          return (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:text-accent"
                onClick={() => void pick(e)}
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
                  <span className="block truncate text-sm font-medium">{ru ?? e.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[ru ? e.name : null, e.equipment ? (EQUIPMENT_RU[e.equipment] ?? e.equipment) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <Icon name="chevron-right" size={18} className="text-muted" />
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
