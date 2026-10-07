import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../../db/types'
import { FormaDB } from '../../db'
import { computeTargets, currentWeightKg, mifflinStJeor, scaleFood, sumMacros } from './calc'
import { BUILT_IN_FOODS, ensureBuiltInFoods } from './builtInFoods'

const NOW = new Date(2026, 5, 1)

const profile: Profile = {
  id: 1,
  name: 'Тест',
  sex: 'male',
  birthYear: 2000,
  heightCm: 183,
  weightKg: 88,
  activityLevel: 'active',
  goal: 'cut',
  proteinPerKg: 2.0,
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('computeTargets', () => {
  afterEach(() => vi.useRealTimers())

  it('183 cm / 88 kg / 26 y / active / cut — Mifflin–St Jeor', () => {
    const t = computeTargets(profile, 88, NOW)
    // 10·88 + 6.25·183 − 5·26 + 5 = 1898.75
    expect(t.bmr).toBe(1899)
    // 1898.75 × 1.725 = 3275.34
    expect(t.tdee).toBe(3275)
    // 3275.34 × 0.82 = 2685.78
    expect(t.kcal).toBe(2686)
    expect(t.proteinG).toBe(176)
    expect(t.fatG).toBe(79)
    // (2686 − 176·4 − 79·9) / 4 = 317.75
    expect(t.carbsG).toBe(318)
    for (const v of Object.values(t)) expect(Number.isInteger(v)).toBe(true)
  })

  it('the TASKS.md reference numbers (1892 / 3264 / 2676) correspond to 182 cm', () => {
    const t = computeTargets({ ...profile, heightCm: 182 }, 88, NOW)
    expect(Math.abs(t.bmr - 1892)).toBeLessThanOrEqual(2)
    expect(Math.abs(t.tdee - 3264)).toBeLessThanOrEqual(5)
    expect(Math.abs(t.kcal - 2676)).toBeLessThanOrEqual(2)
  })

  it('age defaults to the current calendar year', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 7))
    expect(computeTargets(profile, 88).bmr).toBe(1899)
    vi.setSystemTime(new Date(2027, 0, 1))
    expect(computeTargets(profile, 88).bmr).toBe(1894)
  })

  it('female constant, goals and activity multipliers', () => {
    expect(mifflinStJeor('female', 60, 165, 30)).toBeCloseTo(600 + 1031.25 - 150 - 161)
    const f = computeTargets({ ...profile, sex: 'female', weightKg: 60, heightCm: 165, birthYear: 1996, activityLevel: 'sedentary', goal: 'maintain' }, 60, NOW)
    expect(f.bmr).toBe(1320)
    expect(f.tdee).toBe(1584) // 1320.25 × 1.2
    expect(f.kcal).toBe(1584)
    const bulk = computeTargets({ ...profile, goal: 'lean_bulk', activityLevel: 'moderate' }, 88, NOW)
    expect(bulk.tdee).toBe(Math.round(1898.75 * 1.55))
    expect(bulk.kcal).toBe(Math.round(1898.75 * 1.55 * 1.1))
  })

  it('kcalTargetOverride replaces kcal; macros follow it; protein per kg is configurable', () => {
    const t = computeTargets({ ...profile, kcalTargetOverride: 2400, proteinPerKg: 2.2 }, 80, NOW)
    expect(t.kcal).toBe(2400)
    expect(t.proteinG).toBe(176)
    expect(t.fatG).toBe(72)
    expect(t.carbsG).toBe(Math.round((2400 - 176 * 4 - 72 * 9) / 4))
    expect(t.bmr).toBe(Math.round(10 * 80 + 6.25 * 183 - 130 + 5))
  })

  it('protein defaults to 2.0 g/kg and carbs never go negative', () => {
    const t = computeTargets({ ...profile, proteinPerKg: undefined, kcalTargetOverride: 900 }, 100, NOW)
    expect(t.proteinG).toBe(200)
    expect(t.carbsG).toBe(0)
  })
})

describe('currentWeightKg', () => {
  it('uses the latest weigh-in by date, else the profile weight', () => {
    expect(currentWeightKg(profile, [])).toBe(88)
    expect(currentWeightKg(profile, undefined)).toBe(88)
    expect(
      currentWeightKg(profile, [
        { id: 'a', date: '2026-03-02', weightKg: 86.4 },
        { id: 'b', date: '2026-03-05', weightKg: 85.9 },
        { id: 'c', date: '2026-03-01', weightKg: 87 },
      ]),
    ).toBe(85.9)
  })
})

describe('scaleFood / sumMacros', () => {
  const chicken = { kcal: 113, proteinG: 23.6, fatG: 1.9, carbsG: 0.4 }

  it('scales per-100 g values to grams (kcal integer, macros 1 decimal)', () => {
    expect(scaleFood(chicken, 100)).toEqual({ kcal: 113, proteinG: 23.6, fatG: 1.9, carbsG: 0.4 })
    expect(scaleFood(chicken, 200)).toEqual({ kcal: 226, proteinG: 47.2, fatG: 3.8, carbsG: 0.8 })
    expect(scaleFood(chicken, 150)).toEqual({ kcal: 170, proteinG: 35.4, fatG: 2.9, carbsG: 0.6 })
    expect(scaleFood({ kcal: 352, proteinG: 12.3, fatG: 6.2, carbsG: 61.8 }, 45)).toEqual({
      kcal: 158,
      proteinG: 5.5,
      fatG: 2.8,
      carbsG: 27.8,
    })
  })

  it('treats zero / negative / NaN grams as zero', () => {
    for (const g of [0, -50, Number.NaN]) expect(scaleFood(chicken, g)).toEqual({ kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 })
  })

  it('sums entries', () => {
    expect(
      sumMacros([
        { kcal: 226, proteinG: 47.2, fatG: 3.8, carbsG: 0.8 },
        { kcal: 158, proteinG: 5.5, fatG: 2.8, carbsG: 27.8 },
      ]),
    ).toEqual({ kcal: 384, proteinG: 52.7, fatG: 6.6, carbsG: 28.6 })
    expect(sumMacros([])).toEqual({ kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 })
  })
})

describe('built-in foods', () => {
  it('has ~40 plausible products with unique stable ids', () => {
    expect(BUILT_IN_FOODS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(BUILT_IN_FOODS.map((f) => f.id)).size).toBe(BUILT_IN_FOODS.length)
    for (const f of BUILT_IN_FOODS) {
      expect(f.id).toMatch(/^builtin-[a-z0-9-]+$/)
      expect(f.isBuiltIn).toBe(true)
      // Atwater check: kcal ≈ 4P + 4C + 9F within 15 % (fibre/rounding)
      const atwater = 4 * f.proteinG + 4 * f.carbsG + 9 * f.fatG
      expect(Math.abs(atwater - f.kcal), f.name).toBeLessThanOrEqual(Math.max(10, f.kcal * 0.15))
    }
    expect(BUILT_IN_FOODS.find((f) => f.id === 'builtin-chicken-breast')?.name).toMatch(/Куриная грудка/)
  })

  it('seeds idempotently and never touches user foods', async () => {
    const tdb = new FormaDB('test-nutrition-builtin-foods')
    await tdb.foods.put({ id: 'mine', name: 'Сырники', kcal: 220, proteinG: 15, fatG: 9, carbsG: 20 })
    expect(await ensureBuiltInFoods(tdb)).toBe(BUILT_IN_FOODS.length)
    expect(await ensureBuiltInFoods(tdb)).toBe(0)
    expect(await tdb.foods.count()).toBe(BUILT_IN_FOODS.length + 1)
    expect((await tdb.foods.get('builtin-oats'))?.isBuiltIn).toBe(true)
    await tdb.foods.delete('builtin-oats')
    expect(await ensureBuiltInFoods(tdb)).toBe(1)
    expect((await tdb.foods.get('mine'))?.name).toBe('Сырники')
    tdb.close()
  })
})
