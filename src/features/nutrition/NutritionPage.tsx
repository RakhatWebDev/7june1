import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { db } from '../../db'
import type { FoodEntry, MealType } from '../../db/types'
import { fromISODate, toISODate, today } from '../../lib/dates'
import {
  Card,
  CountUp,
  Icon,
  IconBadge,
  PageHeader,
  Progress,
  SectionHeader,
  type Tone,
} from '../../components/ui'
import { MEALS, MEAL_RU, sumMacros } from './calc'
import { n0, n1, MACRO_TONE } from './format'
import { useBuiltInFoodsSeed, useNutritionTargets } from './hooks'
import { EntrySheet } from './EntrySheet'
import { WaterCard } from './WaterCard'
import { DaySwitcher, NutritionNav, StaggerItem } from './ui'

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
  const entries = useLiveQuery(
    () => db.foodEntries.where('date').equals(date).sortBy('createdAt'),
    [date],
  )
  const totals = sumMacros(entries ?? [])
  const targets = ctx?.targets
  const kcalLeft = targets ? targets.kcal - totals.kcal : null

  const go = (delta: number) => {
    const next = toISODate(addDays(fromISODate(date), delta))
    setParams(next === today() ? {} : { date: next }, { replace: true })
  }

  return (
    <>
      <PageHeader title="Питание" />
      <NutritionNav />

      <DaySwitcher
        label={dateLabel(date)}
        testId="diary-date"
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        reset={
          date !== today() && (
            <button
              type="button"
              className="min-h-9 rounded-full bg-warn/15 px-3 text-xs font-medium text-warn transition-transform active:scale-95 motion-reduce:active:scale-100"
              onClick={() => setParams({}, { replace: true })}
            >
              к сегодня
            </button>
          )
        }
      />

      <Card as="section" variant="accent" tone="warn" className="p-5" aria-label="Итоги дня">
        <div className="flex items-start justify-between gap-3">
          <MacroHero eaten={totals.kcal} target={targets?.kcal} />
          <IconBadge name="flame" tone="warn" size="lg" />
        </div>
        <Progress
          value={targets?.kcal ? totals.kcal / targets.kcal : 0}
          tone={targets && totals.kcal > targets.kcal * 1.05 ? 'danger' : 'warn'}
          className="mt-3 h-2.5"
          aria-label="Калории"
        />
        <p className="mt-2 text-xs text-muted tabular-nums">
          {kcalLeft == null
            ? 'Норма не рассчитана'
            : kcalLeft >= 0
              ? `Осталось ${n0(kcalLeft)} ккал`
              : `Сверх нормы ${n0(-kcalLeft)} ккал`}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-4">
          <MacroBar
            label="Белки"
            tone={MACRO_TONE.proteinG}
            eaten={totals.proteinG}
            target={targets?.proteinG}
          />
          <MacroBar
            label="Жиры"
            tone={MACRO_TONE.fatG}
            eaten={totals.fatG}
            target={targets?.fatG}
          />
          <MacroBar
            label="Углеводы"
            tone={MACRO_TONE.carbsG}
            eaten={totals.carbsG}
            target={targets?.carbsG}
          />
        </div>
        {ctx === null && (
          <p className="mt-4 flex items-start gap-1.5 text-xs text-muted">
            <Icon name="info" size={14} className="mt-px text-warn" />
            <span>
              Профиль не заполнен —{' '}
              <Link to="/settings" className="text-warn underline-offset-2 hover:underline">
                укажите данные
              </Link>
              , чтобы рассчитать норму.
            </span>
          </p>
        )}
      </Card>

      {MEALS.map((meal) => {
        const list = (entries ?? []).filter((e) => e.meal === meal)
        const sub = sumMacros(list)
        return (
          <Card
            key={meal}
            as="section"
            className="mt-3 pt-3"
            aria-label={`${MEAL_RU[meal]}: приём пищи`}
          >
            <SectionHeader
              className="mt-0! mb-0!"
              title={MEAL_RU[meal]}
              icon="utensils"
              tone="warn"
              subtitle={
                list.length > 0
                  ? `${n0(sub.kcal)} ккал · Б ${n0(sub.proteinG)} · Ж ${n0(sub.fatG)} · У ${n0(sub.carbsG)}`
                  : 'Пока пусто'
              }
              action={
                <button
                  type="button"
                  aria-label={`Добавить в ${MEAL_RU[meal].toLowerCase()}`}
                  onClick={() => setSheet({ meal })}
                  className="grid size-9 place-items-center rounded-full bg-warn/15 text-warn transition-[background-color,transform] hover:bg-warn/25 active:scale-95 motion-reduce:active:scale-100"
                >
                  <Icon name="plus" size={18} />
                </button>
              }
            />
            {list.length > 0 && (
              <ul
                className="-mx-4 mt-2 -mb-2 divide-y divide-white/[0.05] border-t border-white/[0.05]"
                aria-label={MEAL_RU[meal]}
              >
                {list.map((e, i) => (
                  <StaggerItem key={e.id} index={i}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
                      onClick={() => setSheet({ meal, entry: e })}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{e.name}</span>
                        <span className="block truncate text-xs text-muted tabular-nums">
                          {e.grams > 0 ? `${n1(e.grams)} г · ` : ''}Б {n1(e.proteinG)} · Ж{' '}
                          {n1(e.fatG)} · У {n1(e.carbsG)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="text-[15px] font-semibold">{n0(e.kcal)}</span>
                        <span className="ml-0.5 text-xs text-muted">ккал</span>
                      </span>
                    </button>
                  </StaggerItem>
                ))}
              </ul>
            )}
          </Card>
        )
      })}

      <div className="mt-3">
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

/** Big kcal figure of the hero card. Text reads «Калории{eaten} / {target} ккал». */
function MacroHero({ eaten, target }: { eaten: number; target?: number }) {
  const over = target != null && target > 0 && eaten > target * 1.05
  return (
    <div data-testid="macro-Калории" className="min-w-0">
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">Калории</div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
        <CountUp
          value={eaten}
          format={n0}
          className={`text-[40px] leading-none font-bold tracking-tight ${over ? 'text-danger' : 'text-text'}`}
        />
        <span className="text-sm text-muted tabular-nums">
          {target != null ? ` / ${n0(target)}` : ''} ккал
        </span>
      </div>
    </div>
  )
}

function MacroBar({
  label,
  tone,
  eaten,
  target,
}: {
  label: string
  tone: Tone
  eaten: number
  target?: number
}) {
  const over = target != null && target > 0 && eaten > target * 1.05
  return (
    <div data-testid={`macro-${label}`} className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[tone]}`} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate tabular-nums">
        <CountUp
          value={eaten}
          format={n0}
          className={`text-lg font-semibold ${over ? 'text-danger' : 'text-text'}`}
        />
        <span className="text-xs text-muted">{target != null ? ` / ${n0(target)}` : ''} г</span>
      </div>
      <Progress
        value={target ? eaten / target : 0}
        tone={over ? 'danger' : tone}
        className="mt-1.5 h-1.5"
        aria-label={label}
      />
    </div>
  )
}

const DOT: Partial<Record<Tone, string>> = {
  pink: 'bg-pink',
  violet: 'bg-violet',
  info: 'bg-info',
  warn: 'bg-warn',
}
