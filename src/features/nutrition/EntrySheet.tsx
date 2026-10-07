import { useMemo, useState, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Food, FoodEntry, MealType } from '../../db/types'
import { newId } from '../../lib/id'
import { Button, Chip, Field, Input, Select, Sheet, Stepper } from '../../components/ui'
import { MEALS, MEAL_RU, scaleFood } from './calc'
import { macroLine, n1 } from './format'
import { parseNum } from './hooks'

type Mode = 'search' | 'food' | 'manual'
type Basis = Pick<Food, 'name' | 'kcal' | 'proteinG' | 'fatG' | 'carbsG'> & { id?: string; servingG?: number }

const SEARCH_LIMIT = 50
const GRAM_PRESETS = [50, 100, 150, 200]

/** Per-100 g basis reconstructed from an entry when its food is gone. */
function basisFromEntry(e: FoodEntry): Basis {
  const k = e.grams > 0 ? 100 / e.grams : 0
  return { id: e.foodId, name: e.name, kcal: e.kcal * k, proteinG: e.proteinG * k, fatG: e.fatG * k, carbsG: e.carbsG * k }
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
      .sort((a, b) => Number(!!a.isBuiltIn) - Number(!!b.isBuiltIn) || a.name.localeCompare(b.name, 'ru'))
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
      if ([kcal, p, f, c, g].some((v) => Number.isNaN(v) || v < 0)) return setError('Значения должны быть числами ≥ 0')
      data = { meal, foodId: undefined, name, grams: g, kcal: Math.round(kcal), proteinG: p, fatG: f, carbsG: c }
    } else return
    if (entry) await db.foodEntries.update(entry.id, data)
    else await db.foodEntries.add({ ...data, id: newId(), date, createdAt: new Date().toISOString() })
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
    <Sheet open onClose={onClose} title={editing ? 'Изменить запись' : `Добавить — ${MEAL_RU[meal].toLowerCase()}`}>
      {!editing && (
        <div className="mb-3 flex gap-2">
          <Chip active={mode !== 'manual'} onClick={() => setMode(picked ? 'food' : 'search')}>
            Из базы
          </Chip>
          <Chip active={mode === 'manual'} onClick={() => setMode('manual')}>
            Быстрый ввод
          </Chip>
        </div>
      )}

      {mode === 'search' && (
        <div>
          <Input
            type="search"
            placeholder="Поиск продукта…"
            aria-label="Поиск продукта"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <ul className="mt-3 divide-y divide-border">
            {results.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => pick(f)}
                  className="w-full py-2.5 text-left hover:bg-surface-2"
                >
                  <div className="text-sm font-medium">{f.name}</div>
                  <div className="text-xs text-muted">{macroLine(f)} на 100 г</div>
                </button>
              </li>
            ))}
          </ul>
          {foods && results.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              Ничего не найдено.{' '}
              <button type="button" className="text-accent" onClick={() => setMode('manual')}>
                Ввести вручную
              </button>
            </p>
          )}
        </div>
      )}

      {mode === 'food' && basis && (
        <div className="space-y-4">
          <div>
            {!editing && (
              <button type="button" className="mb-1 text-sm text-muted hover:text-text" onClick={() => setMode('search')}>
                ← К поиску
              </button>
            )}
            <div className="font-medium">{basis.name}</div>
            <div className="text-xs text-muted">{macroLine(scaleFood(basis, 100))} на 100 г</div>
          </div>
          <Field label="Порция, г">
            <div className="flex flex-wrap items-center gap-2">
              <Stepper value={grams} onChange={setGrams} step={10} min={0} max={5000} suffix="г" aria-label="Граммы" />
              {[...new Set([basis.servingG, ...GRAM_PRESETS].filter((g): g is number => !!g))].map((g) => (
                <Chip key={g} active={grams === g} onClick={() => setGrams(g)}>
                  {g} г
                </Chip>
              ))}
            </div>
          </Field>
          {preview && (
            <div className="grid grid-cols-4 gap-2 rounded-xl bg-surface-2 p-3 text-center" aria-label="Итого порция">
              <PreviewCell label="Ккал" value={String(preview.kcal)} />
              <PreviewCell label="Белки" value={n1(preview.proteinG)} />
              <PreviewCell label="Жиры" value={n1(preview.fatG)} />
              <PreviewCell label="Углев." value={n1(preview.carbsG)} />
            </div>
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
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={save}>
              {editing ? 'Сохранить' : 'Добавить'}
            </Button>
            {editing && (
              <Button variant="danger" onClick={remove}>
                Удалить
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function PreviewCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}
