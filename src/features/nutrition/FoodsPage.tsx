import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Food } from '../../db/types'
import { Button, Card, Chip, EmptyState, Icon, Input, PageHeader } from '../../components/ui'
import { n0, n1 } from './format'
import { useBuiltInFoodsSeed } from './hooks'
import { FoodFormSheet } from './FoodFormSheet'
import { NutritionNav, StaggerItem } from './ui'

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
      .filter((f) =>
        filter === 'mine' ? !f.isBuiltIn : filter === 'builtin' ? !!f.isBuiltIn : true,
      )
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(!!a.isBuiltIn) - Number(!!b.isBuiltIn) || a.name.localeCompare(b.name, 'ru'),
      )
  }, [foods, query, filter])

  const mineCount = (foods ?? []).filter((f) => !f.isBuiltIn).length

  return (
    <>
      <PageHeader
        title="Продукты"
        subtitle="Пищевая ценность на 100 г"
        action={
          <Button icon="plus" onClick={() => setSheet({})}>
            Новый
          </Button>
        }
      />
      <NutritionNav />
      <div className="relative">
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <Input
          type="search"
          placeholder="Поиск…"
          aria-label="Поиск продукта"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>
      <div className="mt-3 mb-3 flex flex-wrap gap-2">
        <Chip tone="warn" icon="list" active={filter === 'all'} onClick={() => setFilter('all')}>
          Все
        </Chip>
        <Chip tone="pink" icon="user" active={filter === 'mine'} onClick={() => setFilter('mine')}>
          Мои ({mineCount})
        </Chip>
        <Chip
          tone="info"
          icon="book"
          active={filter === 'builtin'}
          onClick={() => setFilter('builtin')}
        >
          Встроенные
        </Chip>
      </div>

      {foods && list.length === 0 ? (
        <EmptyState
          icon={filter === 'mine' && !query ? 'apple' : 'search'}
          tone="warn"
          title={filter === 'mine' && !query ? 'Своих продуктов пока нет' : 'Ничего не найдено'}
          hint="Добавьте продукт с калорийностью и БЖУ на 100 г."
          action={
            <Button icon="plus" onClick={() => setSheet({})}>
              Новый продукт
            </Button>
          }
        />
      ) : (
        <Card as="div" padding="none" className="overflow-hidden">
          <ul className="divide-y divide-white/[0.05]" aria-label="Продукты">
            {list.slice(0, limit).map((f, i) => (
              <StaggerItem key={f.id} index={i}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
                  onClick={() => setSheet({ food: f })}
                >
                  <span
                    aria-hidden
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                      f.isBuiltIn ? 'bg-info/12 text-info' : 'bg-pink/15 text-pink'
                    }`}
                  >
                    <Icon name={f.isBuiltIn ? 'apple' : 'user'} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.name}</span>
                    <span className="block truncate text-xs text-muted tabular-nums">
                      Б {n1(f.proteinG)} · Ж {n1(f.fatG)} · У {n1(f.carbsG)}
                      {f.isBuiltIn ? ' · встроенный' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block text-[15px] leading-tight font-semibold">
                      {n0(f.kcal)}
                    </span>
                    <span className="block text-[11px] text-muted">ккал</span>
                  </span>
                </button>
              </StaggerItem>
            ))}
          </ul>
        </Card>
      )}
      {list.length > limit && (
        <Button
          variant="secondary"
          icon="chevron-down"
          className="mt-3 w-full"
          onClick={() => setLimit((l) => l + PAGE)}
        >
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
