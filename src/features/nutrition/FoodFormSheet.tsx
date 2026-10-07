import { useState, type ChangeEvent } from 'react'
import { db } from '../../db'
import type { Food } from '../../db/types'
import { newId } from '../../lib/id'
import { Button, Card, Field, Icon, Input, Sheet, TONE_TEXT } from '../../components/ui'
import { n0, n1, MACRO_TONE } from './format'
import { parseNum } from './hooks'

const str = (n: number | undefined) => (n == null ? '' : String(n))

/**
 * Create/edit a user food, or view a built-in one (read-only, can be copied).
 * Mount only while open. `onCopied` receives the id of a freshly created copy.
 */
export function FoodFormSheet({
  food,
  onClose,
  onCopied,
}: {
  food?: Food
  onClose: () => void
  onCopied?: (copy: Food) => void
}) {
  const builtIn = !!food?.isBuiltIn
  const [form, setForm] = useState({
    name: food?.name ?? '',
    kcal: str(food?.kcal),
    proteinG: str(food?.proteinG),
    fatG: str(food?.fatG),
    carbsG: str(food?.carbsG),
    servingG: str(food?.servingG),
  })
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }))

  async function save() {
    const name = form.name.trim()
    const nums = [form.kcal, form.proteinG, form.fatG, form.carbsG].map((v) => parseNum(v || '0'))
    const serving = form.servingG.trim() ? parseNum(form.servingG) : undefined
    if (!name) return setError('Введите название')
    if (!form.kcal.trim()) return setError('Укажите калорийность')
    if (
      nums.some((v) => Number.isNaN(v) || v < 0) ||
      (serving != null && (Number.isNaN(serving) || serving <= 0))
    )
      return setError('Значения должны быть положительными числами')
    const [kcal, proteinG, fatG, carbsG] = nums
    const data: Food = {
      id: food?.id ?? newId(),
      name,
      kcal,
      proteinG,
      fatG,
      carbsG,
      servingG: serving,
      isBuiltIn: false,
    }
    await db.foods.put(data)
    onClose()
  }

  async function copy() {
    if (!food) return
    const c: Food = { ...food, id: newId(), name: `${food.name} (копия)`, isBuiltIn: false }
    await db.foods.add(c)
    onCopied?.(c)
  }

  async function remove() {
    if (!food || builtIn) return
    await db.foods.delete(food.id)
    onClose()
  }

  if (builtIn && food)
    return (
      <Sheet open onClose={onClose} title={food.name}>
        <p className="text-sm text-muted">Встроенный продукт, на 100 г:</p>
        <Card as="div" tone="warn" className="mt-2 grid grid-cols-4 gap-2 p-3! text-center">
          {(
            [
              ['Ккал', n0(food.kcal), MACRO_TONE.kcal],
              ['Белки', n1(food.proteinG), MACRO_TONE.proteinG],
              ['Жиры', n1(food.fatG), MACRO_TONE.fatG],
              ['Углев.', n1(food.carbsG), MACRO_TONE.carbsG],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label} className="min-w-0">
              <div
                className={`truncate text-xl font-bold tracking-tight tabular-nums ${TONE_TEXT[tone]}`}
              >
                {value}
              </div>
              <div className="text-[11px] text-muted">{label}</div>
            </div>
          ))}
        </Card>
        {food.servingG && (
          <p className="mt-2 text-sm text-muted">Порция по умолчанию: {food.servingG} г</p>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted">
          <Icon name="info" size={16} className="mt-0.5" />
          Встроенные продукты нельзя изменить или удалить — скопируйте, чтобы отредактировать.
        </p>
        <div className="mt-4 flex gap-2">
          <Button size="lg" icon="plus" className="flex-1" onClick={copy}>
            Скопировать
          </Button>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </Sheet>
    )

  return (
    <Sheet open onClose={onClose} title={food ? 'Изменить продукт' : 'Новый продукт'}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Название" className="col-span-2">
          <Input value={form.name} onChange={set('name')} placeholder="Например, сырники" />
        </Field>
        <p className="col-span-2 -mb-1 text-xs text-muted">Пищевая ценность на 100 г</p>
        <Field label="Ккал">
          <Input inputMode="decimal" value={form.kcal} onChange={set('kcal')} />
        </Field>
        <Field label="Белки, г">
          <Input inputMode="decimal" value={form.proteinG} onChange={set('proteinG')} />
        </Field>
        <Field label="Жиры, г">
          <Input inputMode="decimal" value={form.fatG} onChange={set('fatG')} />
        </Field>
        <Field label="Углеводы, г">
          <Input inputMode="decimal" value={form.carbsG} onChange={set('carbsG')} />
        </Field>
        <Field label="Порция, г (необяз.)" className="col-span-2">
          <Input inputMode="decimal" value={form.servingG} onChange={set('servingG')} />
        </Field>
      </div>
      {error && (
        <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-danger">
          <Icon name="info" size={15} />
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button size="lg" icon="check" className="flex-1" onClick={save}>
          Сохранить
        </Button>
        {food &&
          (confirmDelete ? (
            <Button variant="danger" size="lg" onClick={remove}>
              Точно удалить?
            </Button>
          ) : (
            <Button variant="danger" size="lg" icon="trash" onClick={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          ))}
      </div>
    </Sheet>
  )
}
