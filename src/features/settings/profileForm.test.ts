import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '../../db/seed'
import { fromFormValues, toFormValues } from './profileForm'

describe('profile form conversion', () => {
  it('round-trips the default profile', () => {
    const now = new Date('2026-10-07T10:00:00Z')
    const res = fromFormValues(toFormValues(DEFAULT_PROFILE), now)
    expect(res.errors).toBeNull()
    expect(res.profile).toEqual({ ...DEFAULT_PROFILE, updatedAt: now.toISOString() })
  })

  it('drops empty optional fields and accepts decimal commas', () => {
    const v = { ...toFormValues(DEFAULT_PROFILE), targetWeightKg: '', kcalTargetOverride: '', weightKg: '87,5' }
    const res = fromFormValues(v)
    expect(res.profile).not.toHaveProperty('targetWeightKg')
    expect(res.profile).not.toHaveProperty('kcalTargetOverride')
    expect(res.profile?.weightKg).toBe(87.5)
  })

  it('reports out-of-range and missing values', () => {
    const res = fromFormValues({ ...toFormValues(DEFAULT_PROFILE), heightCm: '', weightKg: '5', proteinPerKg: 'abc' })
    expect(res.profile).toBeNull()
    expect(res.errors).toEqual({ heightCm: 'Обязательное поле', weightKg: 'От 30 до 300', proteinPerKg: 'От 0.5 до 4' })
  })
})
