import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db'
import { BUILT_IN_FOODS } from './builtInFoods'
import { renderNutrition, resetNutritionDb } from './testUtils'

describe('FoodsPage', () => {
  beforeEach(() => resetNutritionDb())

  it('searches, adds, edits and deletes own foods', async () => {
    const user = userEvent.setup()
    renderNutrition('/nutrition/foods')
    expect(await screen.findByText('Банан')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Поиск продукта'), 'ГРЕЧ')
    await waitFor(() => expect(screen.queryByText('Банан')).not.toBeInTheDocument())
    expect(screen.getByText('Гречка варёная')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Поиск продукта'))

    await user.click(screen.getByRole('button', { name: 'Новый' }))
    let dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Название'), 'Сырники')
    await user.type(within(dialog).getByLabelText('Ккал'), '220')
    await user.type(within(dialog).getByLabelText('Белки, г'), '15')
    await user.type(within(dialog).getByLabelText('Жиры, г'), '9,5')
    await user.type(within(dialog).getByLabelText('Углеводы, г'), '20')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Сырники')).toBeInTheDocument()
    const mine = (await db.foods.toArray()).find((f) => f.name === 'Сырники')
    expect(mine).toMatchObject({ kcal: 220, proteinG: 15, fatG: 9.5, carbsG: 20, isBuiltIn: false })

    await user.click(screen.getByText('Сырники'))
    dialog = screen.getByRole('dialog')
    const name = within(dialog).getByLabelText('Название')
    await user.clear(name)
    await user.type(name, 'Сырники домашние')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Сырники домашние')).toBeInTheDocument()

    await user.click(screen.getByText('Сырники домашние'))
    dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    await user.click(within(dialog).getByRole('button', { name: 'Точно удалить?' }))
    await waitFor(() => expect(screen.queryByText('Сырники домашние')).not.toBeInTheDocument())
    expect(await db.foods.count()).toBe(BUILT_IN_FOODS.length)
  })

  it('built-in foods cannot be deleted but can be copied and edited', async () => {
    const user = userEvent.setup()
    renderNutrition('/nutrition/foods')
    await user.click(await screen.findByText('Банан'))
    let dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Скопировать' }))

    dialog = await screen.findByRole('dialog', { name: 'Изменить продукт' })
    expect(within(dialog).getByLabelText('Название')).toHaveValue('Банан (копия)')
    expect(within(dialog).getByRole('button', { name: 'Удалить' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    await waitFor(async () => expect(await db.foods.count()).toBe(BUILT_IN_FOODS.length + 1))
    expect((await db.foods.get('builtin-banana'))?.isBuiltIn).toBe(true)
    await user.click(screen.getByRole('button', { name: /Мои \(1\)/ }))
    expect(screen.getByText('Банан (копия)')).toBeInTheDocument()
    expect(screen.queryByText('Банан')).not.toBeInTheDocument()
  })
})
