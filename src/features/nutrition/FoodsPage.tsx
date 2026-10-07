import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Food } from '../../db/types'
import { Button, Chip, EmptyState, Input, PageHeader } from '../../components/ui'
import { macroLine } from './format'
import { useBuiltInFoodsSeed } from './hooks'
import { FoodFormSheet } from './FoodFormSheet'

type Filter = 'all' | 'mine' | 'builtin'
type SheetState = { food?: Food } | null

const PAGE = 60

/** Food library: search, add/edit/delete own foods, view and copy built-in ones. */
export function FoodsPage() {
  useBuiltInFoodsSeed()
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(PAGE)
  const [sheet, setSheet] = useState<SheetState>(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (foods ?? [])
      .filter((f) => (filter === 'mine' ? !f.isBuiltIn : filter === 'builtin' ? !!f.isBuiltIn : true))
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!!a.isBuiltIn) - Number(!!b.isBuiltIn) || a.name.localeCompare(b.name, 'ru'))
  }, [foods, query, filter])

  const mineCount = (foods ?? []).filter((f) => !f.isBuiltIn).length

  return (
    <>
      <PageHeader
        title="Продукты"
        subtitle="Пищевая ценность на 100 г"
        back="/nutrition"
        action={<Button onClick={() => setSheet({})}>+ Новый</Button>}
      />
      <Input
        type="search"
        placeholder="Поиск…"
        aria-label="Поиск продукта"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-3 mb-3 flex gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          Все
        </Chip>
        <Chip active={filter === 'mine'} onClick={() => setFilter('mine')}>
          Мои ({mineCount})
        </Chip>
        <Chip active={filter === 'builtin'} onClick={() => setFilter('builtin')}>
          Встроенные
        </Chip>
      </div>

      {foods && list.length === 0 ? (
        <EmptyState
          title={filter === 'mine' && !query ? 'Своих продуктов пока нет' : 'Ничего не найдено'}
          hint="Добавьте продукт с калорийностью и БЖУ на 100 г."
          action={<Button onClick={() => setSheet({})}>+ Новый продукт</Button>}
        />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {list.slice(0, limit).map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2"
                onClick={() => setSheet({ food: f })}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{f.name}</span>
                  <span className="block text-xs text-muted">{macroLine(f)}</span>
                </span>
                {f.isBuiltIn && (
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">встроенный</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > limit && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setLimit((l) => l + PAGE)}>
          Показать ещё
        </Button>
      )}

      {sheet && (
        <FoodFormSheet
          key={sheet.food?.id ?? 'new'}
          food={sheet.food}
          onClose={() => setSheet(null)}
          onCopied={(copy) => setSheet({ food: copy })}
        />
      )}
    </>
  )
}
