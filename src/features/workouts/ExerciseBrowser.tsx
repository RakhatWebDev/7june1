import { useMemo, useState } from 'react'
import { Chip, Skeleton } from '../../components/ui'
import { Icon, type IconName } from '../../components/icons'
import { EQUIPMENT_RU, MUSCLE_RU, exerciseImageUrl } from '../../data/exercises'
import type { Exercise } from '../../db/types'
import {
  EQUIPMENT_GROUPS,
  MUSCLE_GROUPS,
  browseExercises,
  equipmentGroupsIn,
  type EquipmentGroupId,
  type MuscleGroupId,
} from './categories'

/** One library row: thumbnail, Russian alias (if any) or name, then English name · muscles · equipment. */
export function ExerciseListItem({
  exercise: e,
  alias,
  trailingIcon = 'chevron-right',
  onPick,
}: {
  exercise: Exercise
  alias?: string
  trailingIcon?: IconName
  onPick: () => void
}) {
  const muscles = e.primaryMuscles.map((m) => MUSCLE_RU[m] ?? m).join(', ')
  const equipment = e.equipment ? (EQUIPMENT_RU[e.equipment] ?? e.equipment) : null
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:text-accent"
        onClick={onPick}
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
          <span className="block truncate text-sm font-medium">{alias ?? e.name}</span>
          <span className="block truncate text-xs text-muted">
            {[alias ? e.name : null, muscles || null, equipment].filter(Boolean).join(' · ')}
          </span>
        </span>
        <Icon name={trailingIcon} size={18} className="shrink-0 text-muted" />
      </button>
    </li>
  )
}

const chipRow = 'flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

/**
 * «По категориям»: a scrollable chip row of muscle groups («Все», Грудь, Спина…), a second row of the
 * equipment present in the group, and the matching exercises (≤ 40, popular / illustrated first).
 * `query` narrows the list within the selected group (or the whole library with «Все»).
 */
export function CategoryBrowser({
  exercises,
  aliases,
  query,
  group,
  onGroup,
  onPick,
  excludeId,
  loading = false,
  trailingIcon,
}: {
  exercises: Exercise[]
  aliases: Map<string, string[]>
  query: string
  group: MuscleGroupId | null
  onGroup: (g: MuscleGroupId | null) => void
  onPick: (e: Exercise) => void
  excludeId?: string
  loading?: boolean
  trailingIcon?: IconName
}) {
  const [equipment, setEquipment] = useState<EquipmentGroupId | null>(null)
  const available = useMemo(() => equipmentGroupsIn(exercises, group), [exercises, group])
  const activeEquipment = equipment && available.includes(equipment) ? equipment : null
  const list = useMemo(
    () => browseExercises(exercises, aliases, { group, equipment: activeEquipment, query, excludeId }),
    [exercises, aliases, group, activeEquipment, query, excludeId],
  )

  const selectGroup = (g: MuscleGroupId | null) => {
    onGroup(g)
    setEquipment(null)
  }

  return (
    <div>
      <div role="group" aria-label="Группа мышц" className={chipRow}>
        <Chip active={group === null} onClick={() => selectGroup(null)} className="shrink-0">
          Все
        </Chip>
        {MUSCLE_GROUPS.map((g) => (
          <Chip key={g.id} active={group === g.id} onClick={() => selectGroup(g.id)} className="shrink-0">
            {g.label}
          </Chip>
        ))}
      </div>
      {available.length > 1 && (
        <div role="group" aria-label="Оборудование" className={`mt-1.5 ${chipRow}`}>
          {EQUIPMENT_GROUPS.filter((g) => available.includes(g.id)).map((g) => (
            <Chip
              key={g.id}
              tone="info"
              active={activeEquipment === g.id}
              onClick={() => setEquipment(activeEquipment === g.id ? null : g.id)}
              className="shrink-0"
            >
              {g.label}
            </Chip>
          ))}
        </div>
      )}
      {loading && (
        <div className="mt-2 space-y-2">
          <span className="sr-only">Загрузка библиотеки…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      )}
      {!loading && list.length === 0 && <p className="mt-3 text-center text-sm text-muted">Ничего не найдено</p>}
      <ul className="mt-1 divide-y divide-white/[0.06]" data-testid="category-results">
        {list.map((e) => (
          <ExerciseListItem
            key={e.id}
            exercise={e}
            alias={aliases.get(e.id)?.[0]}
            trailingIcon={trailingIcon}
            onPick={() => onPick(e)}
          />
        ))}
      </ul>
    </div>
  )
}
