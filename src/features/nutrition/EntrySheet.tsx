import { useMemo, useState, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Food, FoodEntry, MealType } from '../../db/types'
import { newId } from '../../lib/id'
import {
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Input,
  Select,
  Sheet,
  Stepper,
  TONE_TEXT,
  type Tone,
} from '../../components/ui'
import { MEALS, MEAL_RU, scaleFood } from './calc'
import { macroLine, n0, n1, MACRO_TONE } from './format'
import { parseNum } from './hooks'
import { StaggerItem } from './ui'

type Mode = 'search' | 'food' | 'manual'
type Basis = Pick<Food, 'name' | 'kcal' | 'proteinG' | 'fatG' | 'carbsG'> & {
  id?: string
  servingG?: number
}

const SEARCH_LIMIT = 50
const GRAM_PRESETS = [50, 100, 150, 200]

/** Per-100 g basis reconstructed from an entry when its food is gone. */
function basisFromEntry(e: FoodEntry): Basis {
  const k = e.grams > 0 ? 100 / e.grams : 0
  return {
    id: e.foodId,
    name: e.name,
    kcal: e.kcal * k,
    proteinG: e.proteinG * k,
    fatG: e.fatG * k,
    carbsG: e.carbsG * k,
  }
}

const str = (n: number | undefined) => (n == null ? '' : String(n))

/**
 * Add a diary entry (search the food library or quick manual input) or edit/delete an existing one.
 * Mount it only while open so its state starts fresh each time.
 */
export function EntrySheet({
  date,
  meal: initialMeal,
  entry,
  onClose,
}: {
  date: string
  meal: MealType
  entry?: FoodEntry
  onClose: () => void
}) {
  const editing = !!entry
  const [mode, setMode] = useState<Mode>(
    entry ? (entry.foodId && entry.grams > 0 ? 'food' : 'manual') : 'search',
  )
  const [meal, setMeal] = useState<MealType>(entry?.meal ?? initialMeal)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Food | null>(null)
  const [grams, setGrams] = useState<number | null>(entry?.grams ?? 100)
  const [manual, setManual] = useState({
    name: entry?.name ?? '',
    grams: entry && entry.grams > 0 ? str(entry.grams) : '',
    kcal: str(entry?.kcal),
    proteinG: str(entry?.proteinG),
    fatG: str(entry?.fatG),
    carbsG: str(entry?.carbsG),
  })
  const [error, setError] = useState('')

  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const linkedFood = useLiveQuery(
    async () => (entry?.foodId ? ((await db.foods.get(entry.foodId)) ?? null) : null),
    [entry?.foodId],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (foods ?? [])
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(!!a.isBuiltIn) - Number(!!b.isBuiltIn) || a.name.localeCompare(b.name, 'ru'),
      )
      .slice(0, SEARCH_LIMIT)
  }, [foods, query])

  const basis: Basis | null = picked ?? linkedFood ?? (entry ? basisFromEntry(entry) : null)
  const preview = basis ? scaleFood(basis, grams ?? 0) : null

  function pick(f: Food) {
    setPicked(f)
    setGrams(f.servingG ?? 100)
    setMode('food')
    setError('')
  }

  async function save() {
    let data: Omit<FoodEntry, 'id' | 'date' | 'createdAt'>
    if (mode === 'food') {
      if (!basis || !grams || grams <= 0) return setError('Укажите вес порции в граммах')
      data = { meal, foodId: basis.id, name: basis.name, grams, ...scaleFood(basis, grams) }
    } else if (mode === 'manual') {
      const name = manual.name.trim()
      const kcal = parseNum(manual.kcal || '0')
      const p = parseNum(manual.proteinG || '0')
      const f = parseNum(manual.fatG || '0')
      const c = parseNum(manual.carbsG || '0')
      const g = manual.grams ? parseNum(manual.grams) : 0
      if (!name) return setError('Введите название')
      if ([kcal, p, f, c, g].some((v) => Number.isNaN(v) || v < 0))
        return setError('Значения должны быть числами ≥ 0')
      data = {
        meal,
        foodId: undefined,
        name,
        grams: g,
        kcal: Math.round(kcal),
        proteinG: p,
        fatG: f,
        carbsG: c,
      }
    } else return
    if (entry) await db.foodEntries.update(entry.id, data)
    else
      await db.foodEntries.add({ ...data, id: newId(), date, createdAt: new Date().toISOString() })
    onClose()
  }

  async function remove() {
    if (!entry) return
    await db.foodEntries.delete(entry.id)
    onClose()
  }

  const setM = (k: keyof typeof manual) => (e: ChangeEvent<HTMLInputElement>) =>
    setManual((s) => ({ ...s, [k]: e.target.value }))

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Изменить запись' : `Добавить — ${MEAL_RU[meal].toLowerCase()}`}
    >
      {!editing && (
        <div className="mb-3 flex gap-2">
          <Chip
            tone="warn"
            icon="search"
            active={mode !== 'manual'}
            onClick={() => setMode(picked ? 'food' : 'search')}
          >
            Из базы
          </Chip>
          <Chip
            tone="warn"
            icon="edit"
            active={mode === 'manual'}
            onClick={() => setMode('manual')}
          >
            Быстрый ввод
          </Chip>
        </div>
      )}

      {mode === 'search' && (
        <div>
          <div className="relative">
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            />
            <Input
              type="search"
              placeholder="Поиск продукта…"
              aria-label="Поиск продукта"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
          <ul className="-mx-4 mt-2 divide-y divide-white/[0.05]">
            {results.map((f, i) => (
              <StaggerItem key={f.id} index={i}>
                <button
                  type="button"
                  onClick={() => pick(f)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.name}</span>
                    <span className="block truncate text-xs text-muted tabular-nums">
                      Б {n1(f.proteinG)} · Ж {n1(f.fatG)} · У {n1(f.carbsG)} на 100 г
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                    {n0(f.kcal)}
                    <span className="ml-0.5 text-xs font-normal text-muted">ккал</span>
                  </span>
                  <Icon name="plus" size={16} className="text-warn" />
                </button>
              </StaggerItem>
            ))}
          </ul>
          {foods && results.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted">
              <span
                className="grid size-11 place-items-center rounded-2xl bg-surface-3 text-muted"
                aria-hidden
              >
                <Icon name="search" size={20} />
              </span>
              Ничего не найдено.
              <Button variant="secondary" size="sm" icon="edit" onClick={() => setMode('manual')}>
                Ввести вручную
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === 'food' && basis && (
        <div className="space-y-4">
          <div>
            {!editing && (
              <button
                type="button"
                className="-ml-1 mb-1 inline-flex items-center gap-0.5 rounded-lg py-0.5 pr-2 text-sm text-muted transition-colors hover:text-text"
                onClick={() => setMode('search')}
              >
                <Icon name="chevron-left" size={16} />К поиску
              </button>
            )}
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-warn/15 text-warn"
              >
                <Icon name="apple" size={20} />
              </span>
              <div className="min-w-0">
                <div className="font-semibold tracking-tight">{basis.name}</div>
                <div className="text-xs text-muted tabular-nums">
                  {macroLine(scaleFood(basis, 100))} на 100 г
                </div>
              </div>
            </div>
          </div>
          <Field label="Порция, г">
            <div className="flex flex-wrap items-center gap-2">
              <Stepper
                value={grams}
                onChange={setGrams}
                step={10}
                min={0}
                max={5000}
                suffix="г"
                aria-label="Граммы"
              />
              {[...new Set([basis.servingG, ...GRAM_PRESETS].filter((g): g is number => !!g))].map(
                (g) => (
                  <Chip key={g} tone="warn" active={grams === g} onClick={() => setGrams(g)}>
                    {g} г
                  </Chip>
                ),
              )}
            </div>
          </Field>
          {preview && (
            <Card
              as="div"
              tone="warn"
              className="grid grid-cols-4 gap-2 p-3! text-center"
              aria-label="Итого порция"
            >
              <PreviewCell label="Ккал" value={String(preview.kcal)} tone={MACRO_TONE.kcal} />
              <PreviewCell label="Белки" value={n1(preview.proteinG)} tone={MACRO_TONE.proteinG} />
              <PreviewCell label="Жиры" value={n1(preview.fatG)} tone={MACRO_TONE.fatG} />
              <PreviewCell label="Углев." value={n1(preview.carbsG)} tone={MACRO_TONE.carbsG} />
            </Card>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Название" className="col-span-2">
            <Input value={manual.name} onChange={setM('name')} placeholder="Например, шаурма" />
          </Field>
          <Field label="Ккал">
            <Input inputMode="decimal" value={manual.kcal} onChange={setM('kcal')} />
          </Field>
          <Field label="Граммы (необяз.)">
            <Input inputMode="decimal" value={manual.grams} onChange={setM('grams')} />
          </Field>
          <Field label="Белки, г">
            <Input inputMode="decimal" value={manual.proteinG} onChange={setM('proteinG')} />
          </Field>
          <Field label="Жиры, г">
            <Input inputMode="decimal" value={manual.fatG} onChange={setM('fatG')} />
          </Field>
          <Field label="Углеводы, г">
            <Input inputMode="decimal" value={manual.carbsG} onChange={setM('carbsG')} />
          </Field>
        </div>
      )}

      {mode !== 'search' && (
        <div className="mt-4 space-y-3">
          <Field label="Приём пищи">
            <Select value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
              {MEALS.map((m) => (
                <option key={m} value={m}>
                  {MEAL_RU[m]}
                </option>
              ))}
            </Select>
          </Field>
          {error && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-danger">
              <Icon name="info" size={15} />
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="lg" icon={editing ? 'check' : 'plus'} className="flex-1" onClick={save}>
              {editing ? 'Сохранить' : 'Добавить'}
            </Button>
            {editing && (
              <Button variant="danger" size="lg" icon="trash" onClick={remove}>
                Удалить
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function PreviewCell({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="min-w-0">
      <div className={`truncate text-xl font-bold tracking-tight tabular-nums ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  )
}
