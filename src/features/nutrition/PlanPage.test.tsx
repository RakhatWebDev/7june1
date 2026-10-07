import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db'
import { computeTargets } from './calc'
import { renderNutrition, resetNutritionDb, TEST_PROFILE } from './testUtils'

const nbsp = (n: number) => new RegExp(n.toLocaleString('ru-RU').replace(/\s/g, '\\s'))

describe('PlanPage', () => {
  beforeEach(() => resetNutritionDb())

  it('shows computed targets with the formula and sets/resets the kcal override', async () => {
    const user = userEvent.setup()
    const t = computeTargets(TEST_PROFILE, 88)
    renderNutrition('/nutrition/plan')
    await waitFor(() => expect(screen.getByTestId('plan-kcal')).toHaveTextContent(nbsp(t.kcal)))
    expect(screen.getByText(/Миффлин — Сан Жеор: 10 × 88 \+ 6,25 × 183/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`^${nbsp(t.bmr).source} ккал$`))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`^${nbsp(t.tdee).source} ккал$`))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'настройках профиля' })).toHaveAttribute('href', '/settings')

    await user.type(screen.getByLabelText('Ккал в день'), '2500')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(screen.getByTestId('plan-kcal')).toHaveTextContent(/2\s500/))
    expect((await db.profile.get(1))?.kcalTargetOverride).toBe(2500)
    expect(screen.getByText('задано вручную')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Сбросить к расчёту' }))
    await waitFor(() => expect(screen.getByTestId('plan-kcal')).toHaveTextContent(nbsp(t.kcal)))
    expect((await db.profile.get(1))?.kcalTargetOverride).toBeUndefined()
  })

  it('rejects implausible overrides', async () => {
    const user = userEvent.setup()
    renderNutrition('/nutrition/plan')
    await user.type(await screen.findByLabelText('Ккал в день'), '50')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Введите число от 800 до 8000')).toBeInTheDocument()
    expect((await db.profile.get(1))?.kcalTargetOverride).toBeUndefined()
  })
})
