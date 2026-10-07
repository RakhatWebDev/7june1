import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { db } from '../../db'
import type { Profile } from '../../db/types'
import { nutritionRoutes } from './routes'

export const TEST_PROFILE: Profile = {
  id: 1,
  name: 'Тест',
  sex: 'male',
  birthYear: 2000,
  heightCm: 183,
  weightKg: 88,
  activityLevel: 'active',
  goal: 'cut',
  proteinPerKg: 2.0,
  waterTargetMl: 3000,
  updatedAt: '2026-01-01T00:00:00.000Z',
}

export async function resetNutritionDb(profile: Profile | null = TEST_PROFILE) {
  await Promise.all([
    db.profile.clear(),
    db.foods.clear(),
    db.foodEntries.clear(),
    db.water.clear(),
    db.weights.clear(),
  ])
  if (profile) await db.profile.put(profile)
}

export function renderNutrition(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {nutritionRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
        <Route path="settings" element={<div>settings</div>} />
      </Routes>
    </MemoryRouter>,
  )
}
