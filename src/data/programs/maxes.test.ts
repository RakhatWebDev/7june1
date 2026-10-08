import { describe, expect, it } from 'vitest'
import { FormaDB } from '../../db'
import {
  DEFAULT_MAXES,
  ensureProgramSettingsSeeded,
  getMaxes,
  getTrainingMaxes,
  MAXES_KEY,
  roundToStep,
  saveMax,
  suggestedKg,
} from './maxes'

let n = 0
const fresh = () => new FormaDB(`test-maxes-${n++}`)

describe('maxes', () => {
  it('rounds suggested weights to 2.5 kg', () => {
    expect(roundToStep(36)).toBe(35)
    expect(roundToStep(42)).toBe(42.5)
    expect(suggestedKg(0.8, 60)).toBe(47.5)
    expect(suggestedKg(0.92, 70)).toBe(65)
    expect(suggestedKg(undefined, 60)).toBeUndefined()
    expect(suggestedKg(0.8, undefined)).toBeUndefined()
  })

  it('seeds the user maxes and the default active program only when absent', async () => {
    const db = fresh()
    await ensureProgramSettingsSeeded(db)
    expect(await getMaxes(db)).toEqual(DEFAULT_MAXES)
    expect((await db.settings.get('activeProgramId'))?.value).toBe('david-laid-program-1')
    await db.settings.put({ key: MAXES_KEY, value: { Barbell_Squat: 80 } })
    await db.settings.put({ key: 'activeProgramId', value: 'david-laid-dup' })
    await ensureProgramSettingsSeeded(db)
    expect(await getMaxes(db)).toEqual({ Barbell_Squat: 80 })
    expect((await db.settings.get('activeProgramId'))?.value).toBe('david-laid-dup')
  })

  it('training maxes fall back to tested maxes; saving a max sets or raises them', async () => {
    const db = fresh()
    await ensureProgramSettingsSeeded(db)
    expect((await getTrainingMaxes(db)).Barbell_Squat).toBe(60)
    await saveMax(db, 'Barbell_Squat', 65, 'raise')
    expect((await getMaxes(db)).Barbell_Squat).toBe(65)
    expect((await getTrainingMaxes(db)).Barbell_Squat).toBe(65)
    await saveMax(db, 'Barbell_Squat', 62.5, 'set')
    expect((await getTrainingMaxes(db)).Barbell_Squat).toBe(62.5)
    await saveMax(db, 'Barbell_Squat', null)
    expect((await getMaxes(db)).Barbell_Squat).toBeUndefined()
  })
})
