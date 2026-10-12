import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Input, SegmentedControl, Sheet, Skeleton } from '../../components/ui'
import { Icon } from '../../components/icons'
import { db } from '../../db'
import type { Exercise, WorkoutSession } from '../../db/types'
import { replaceExercise } from './actions'
import { rankAlternatives } from './alternatives'
import { MUSCLE_GROUPS, muscleGroupOf, type MuscleGroupId } from './categories'
import { CategoryBrowser, ExerciseListItem } from './ExerciseBrowser'
import { filterExercises, occurrenceIndex } from './calc'
import { useExerciseAliases, useExerciseMap } from './hooks'
import { applyDayOverrides, getOverrides, setOverride } from './overrides'

const MAX_SEARCH = 30

/**
 * «Альтернативы для <name>»: «Похожие» — ranked suggestions (curated for main lifts, then by muscles / force /
 * mechanic / equipment) plus a search over the whole library; «По категориям» — browse by muscle group
 * (preselected from the replaced exercise) and equipment, the search narrowing within the group.
 * Replaces only today, or in the program as well.
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
  const [mode, setMode] = useState<'similar' | 'categories'>('similar')
  /** `undefined` until the user picks a chip: the replaced exercise's own group is used */
  const [pickedGroup, setPickedGroup] = useState<MuscleGroupId | null | undefined>(undefined)

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
  const group = pickedGroup === undefined ? (current ? muscleGroupOf(current) : null) : pickedGroup
  const groupLabel = MUSCLE_GROUPS.find((g) => g.id === group)?.label

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
          placeholder={
            mode === 'categories' && groupLabel ? `Поиск в группе «${groupLabel}»` : 'Поиск по всей библиотеке'
          }
          aria-label="Поиск замены"
          className="pl-10"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <SegmentedControl
        aria-label="Как искать"
        size="sm"
        className="mt-3"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'similar', label: 'Похожие' },
          { value: 'categories', label: 'По категориям' },
        ]}
      />
      {mode === 'categories' ? (
        <div className="mt-3">
          <CategoryBrowser
            exercises={exercises}
            aliases={aliases}
            query={query}
            group={group}
            onGroup={setPickedGroup}
            onPick={(e) => void pick(e)}
            excludeId={exercise.exerciseId}
            loading={loading}
          />
        </div>
      ) : (
        <>
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
            {list.map((e) => (
              <ExerciseListItem key={e.id} exercise={e} alias={aliases.get(e.id)?.[0]} onPick={() => void pick(e)} />
            ))}
          </ul>
        </>
      )}
    </Sheet>
  )
}
