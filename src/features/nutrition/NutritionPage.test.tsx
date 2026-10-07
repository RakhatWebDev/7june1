import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { BUILT_IN_FOODS } from './builtInFoods'
import { renderNutrition, resetNutritionDb } from './testUtils'

const macro = (label: string) => screen.getByTestId(`macro-${label}`)

describe('NutritionPage (diary)', () => {
  beforeEach(() => resetNutritionDb())

  it('seeds built-in foods on first open and shows targets from the profile', async () => {
    renderNutrition('/nutrition')
    await waitFor(async () => expect(await db.foods.count()).toBe(BUILT_IN_FOODS.length))
    // Targets: protein 2 g × 88 kg = 176 g, fat 0.9 × 88 ≈ 79 g
    await waitFor(() => expect(macro('Белки')).toHaveTextContent(/0 \/ 176 г/))
    expect(macro('Жиры')).toHaveTextContent(/0 \/ 79 г/)
    expect(screen.getByText('Завтрак')).toBeInTheDocument()
    expect(screen.getByText('Перекус')).toBeInTheDocument()
    expect(screen.getByTestId('diary-date')).toHaveTextContent('Сегодня')
  })

  it('uses the latest weigh-in instead of the profile weight for targets', async () => {
    await db.weights.bulkAdd([
      { id: 'w1', date: '2026-01-01', weightKg: 90 },
      { id: 'w2', date: '2026-02-01', weightKg: 80 },
    ])
    renderNutrition('/nutrition')
    await waitFor(() => expect(macro('Белки')).toHaveTextContent(/0 \/ 160 г/))
  })

  it('add food from the library → totals update; edit grams; delete', async () => {
    const user = userEvent.setup()
    renderNutrition('/nutrition')
    await waitFor(async () => expect(await db.foods.count()).toBe(BUILT_IN_FOODS.length))

    await user.click(screen.getByRole('button', { name: 'Добавить в завтрак' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Поиск продукта'), 'куриная')
    await user.click(await within(dialog).findByText('Куриная грудка (филе, сырое)'))
    const grams = within(dialog).getByLabelText('Граммы')
    expect(grams).toHaveValue(150) // default serving
    await user.clear(grams)
    await user.type(grams, '200')
    expect(within(dialog).getByLabelText('Итого порция')).toHaveTextContent('226')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))

    await waitFor(() => expect(macro('Калории')).toHaveTextContent(/^Калории226 \//))
    expect(macro('Белки')).toHaveTextContent(/^Белки47 \/ 176 г/)
    const breakfast = screen.getByRole('list', { name: 'Завтрак' })
    expect(within(breakfast).getByText('Куриная грудка (филе, сырое)')).toBeInTheDocument()
    const [entry] = await db.foodEntries.toArray()
    expect(entry).toMatchObject({ date: today(), meal: 'breakfast', grams: 200, kcal: 226, proteinG: 47.2, foodId: 'builtin-chicken-breast' })

    // Edit: 100 g, move to dinner
    await user.click(within(breakfast).getByText('Куриная грудка (филе, сырое)'))
    const edit = screen.getByRole('dialog')
    const g2 = within(edit).getByLabelText('Граммы')
    await user.clear(g2)
    await user.type(g2, '100')
    await user.selectOptions(within(edit).getByRole('combobox'), 'dinner')
    await user.click(within(edit).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(macro('Калории')).toHaveTextContent(/^Калории113 \//))
    expect(await screen.findByRole('list', { name: 'Ужин' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Завтрак' })).not.toBeInTheDocument()

    // Delete
    await user.click(within(screen.getByRole('list', { name: 'Ужин' })).getByText('Куриная грудка (филе, сырое)'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(macro('Калории')).toHaveTextContent(/^Калории0 \//))
    expect(await db.foodEntries.count()).toBe(0)
  })

  it('quick manual entry adds to totals', async () => {
    const user = userEvent.setup()
    renderNutrition('/nutrition')
    await user.click(screen.getByRole('button', { name: 'Добавить в перекус' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Быстрый ввод' }))
    await user.type(within(dialog).getByLabelText('Название'), 'Шаурма')
    await user.type(within(dialog).getByLabelText('Ккал'), '650')
    await user.type(within(dialog).getByLabelText('Белки, г'), '30,5')
    await user.type(within(dialog).getByLabelText('Жиры, г'), '32')
    await user.type(within(dialog).getByLabelText('Углеводы, г'), '60')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    await waitFor(() => expect(macro('Калории')).toHaveTextContent(/^Калории650 \//))
    expect(macro('Белки')).toHaveTextContent(/^Белки31 \//)
    const [e] = await db.foodEntries.toArray()
    expect(e).toMatchObject({ name: 'Шаурма', meal: 'snack', grams: 0, kcal: 650, proteinG: 30.5, fatG: 32, carbsG: 60 })
    expect(e.foodId).toBeUndefined()
  })

  it('water: +250 / +500, progress against target, delete', async () => {
    const user = userEvent.setup()
    renderNutrition('/nutrition')
    await user.click(screen.getByRole('button', { name: '+250 мл' }))
    await user.click(screen.getByRole('button', { name: '+500 мл' }))
    await waitFor(() => expect(screen.getByLabelText('Вода за день')).toHaveTextContent(/750 \/ 3\s000 мл/))
    await user.click(screen.getByRole('button', { name: 'Удалить 250 мл' }))
    await waitFor(() => expect(screen.getByLabelText('Вода за день')).toHaveTextContent(/^500 \//))
  })

  it('shows the day from ?date= and switches days', async () => {
    const user = userEvent.setup()
    await db.foodEntries.add({
      id: 'old',
      date: '2026-01-15',
      meal: 'lunch',
      name: 'Гречка варёная',
      grams: 200,
      kcal: 220,
      proteinG: 8.4,
      fatG: 2.2,
      carbsG: 42.6,
      createdAt: '2026-01-15T12:00:00.000Z',
    })
    renderNutrition('/nutrition?date=2026-01-15')
    expect(await screen.findByText('Гречка варёная')).toBeInTheDocument()
    expect(macro('Калории')).toHaveTextContent(/^Калории220 \//)
    await user.click(screen.getByRole('button', { name: 'Следующий день' }))
    await waitFor(() => expect(screen.queryByText('Гречка варёная')).not.toBeInTheDocument())
    expect(screen.getByTestId('diary-date')).toHaveTextContent(/16 января/)
    await user.click(screen.getByRole('button', { name: 'к сегодня' }))
    await waitFor(() => expect(screen.getByTestId('diary-date')).toHaveTextContent('Сегодня'))
  })
})
