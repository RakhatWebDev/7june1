import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { db } from '../../db'
import type { FoodEntry, MealType } from '../../db/types'
import { fromISODate, toISODate, today } from '../../lib/dates'
import { Button, Card, PageHeader, Progress } from '../../components/ui'
import { MEALS, MEAL_RU, sumMacros } from './calc'
import { n0, n1 } from './format'
import { useBuiltInFoodsSeed, useNutritionTargets } from './hooks'
import { EntrySheet } from './EntrySheet'
import { WaterCard } from './WaterCard'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

type SheetState = { meal: MealType; entry?: FoodEntry } | null

function dateLabel(date: string): string {
  const t = today()
  if (date === t) return 'Сегодня'
  if (date === toISODate(addDays(fromISODate(t), -1))) return 'Вчера'
  if (date === toISODate(addDays(fromISODate(t), 1))) return 'Завтра'
  return format(fromISODate(date), 'EEEEEE, d MMMM', { locale: ru })
}

/** Daily food diary: macros vs targets, meals, water. `?date=YYYY-MM-DD` selects the day. */
export function NutritionPage() {
  useBuiltInFoodsSeed()
  const [params, setParams] = useSearchParams()
  const raw = params.get('date')
  const date = raw && ISO_RE.test(raw) ? raw : today()
  const [sheet, setSheet] = useState<SheetState>(null)

  const ctx = useNutritionTargets()
  const entries = useLiveQuery(() => db.foodEntries.where('date').equals(date).sortBy('createdAt'), [date])
  const totals = sumMacros(entries ?? [])
  const targets = ctx?.targets

  const go = (delta: number) => {
    const next = toISODate(addDays(fromISODate(date), delta))
    setParams(next === today() ? {} : { date: next }, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Питание"
        action={
          <div className="flex gap-1">
            <Link to="/nutrition/plan" className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text">
              Норма
            </Link>
            <Link to="/nutrition/foods" className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text">
              Продукты
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" aria-label="Предыдущий день" onClick={() => go(-1)}>
          ←
        </Button>
        <div className="min-w-0 text-center">
          <div className="truncate font-semibold first-letter:uppercase" data-testid="diary-date">
            {dateLabel(date)}
          </div>
          {date !== today() && (
            <button type="button" className="text-xs text-accent" onClick={() => setParams({}, { replace: true })}>
              к сегодня
            </button>
          )}
        </div>
        <Button variant="secondary" size="sm" aria-label="Следующий день" onClick={() => go(1)}>
          →
        </Button>
      </div>

      <Card className="mb-4 space-y-3">
        <MacroBar label="Калории" unit="ккал" eaten={totals.kcal} target={targets?.kcal} />
        <MacroBar label="Белки" unit="г" eaten={totals.proteinG} target={targets?.proteinG} />
        <MacroBar label="Жиры" unit="г" eaten={totals.fatG} target={targets?.fatG} />
        <MacroBar label="Углеводы" unit="г" eaten={totals.carbsG} target={targets?.carbsG} />
        {ctx === null && (
          <p className="text-xs text-muted">
            Профиль не заполнен — <Link to="/settings" className="text-accent">укажите данные</Link>, чтобы рассчитать норму.
          </p>
        )}
      </Card>

      <div className="space-y-3">
        {MEALS.map((meal) => {
          const list = (entries ?? []).filter((e) => e.meal === meal)
          const sub = sumMacros(list)
          return (
            <Card key={meal} as="section">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{MEAL_RU[meal]}</h2>
                <span className="text-sm text-muted">{list.length > 0 ? `${n0(sub.kcal)} ккал` : ''}</span>
              </div>
              {list.length > 0 && (
                <ul className="mt-2 divide-y divide-border" aria-label={MEAL_RU[meal]}>
                  {list.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-3 py-2 text-left hover:bg-surface-2"
                        onClick={() => setSheet({ meal, entry: e })}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{e.name}</span>
                          <span className="block text-xs text-muted">
                            {e.grams > 0 ? `${n1(e.grams)} г · ` : ''}Б {n1(e.proteinG)} · Ж {n1(e.fatG)} · У {n1(e.carbsG)}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-medium">{n0(e.kcal)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 -ml-2 text-accent"
                aria-label={`Добавить в ${MEAL_RU[meal].toLowerCase()}`}
                onClick={() => setSheet({ meal })}
              >
                + Добавить
              </Button>
            </Card>
          )
        })}

        <WaterCard date={date} targetMl={ctx?.profile.waterTargetMl} />
      </div>

      {sheet && (
        <EntrySheet
          key={sheet.entry?.id ?? sheet.meal}
          date={date}
          meal={sheet.meal}
          entry={sheet.entry}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}

function MacroBar({
  label,
  unit,
  eaten,
  target,
}: {
  label: string
  unit: string
  eaten: number
  target?: number
}) {
  const over = target != null && target > 0 && eaten > target * 1.05
  return (
    <div data-testid={`macro-${label}`}>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted">
          <span className={over ? 'text-warn' : 'text-text'}>{n0(eaten)}</span>
          {target != null ? ` / ${n0(target)}` : ''} {unit}
        </span>
      </div>
      <Progress value={target ? eaten / target : 0} className={over ? '[&>div]:bg-warn' : ''} />
    </div>
  )
}
