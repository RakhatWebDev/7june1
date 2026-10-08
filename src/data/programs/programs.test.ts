import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { builtInPrograms } from './index'
import type { Exercise } from '../../db/types'

const library = JSON.parse(readFileSync('public/data/exercises.json', 'utf8')) as Exercise[]
const ids = new Set(library.map((e) => e.id))

describe('built-in programs', () => {
  it('reference only exercises that exist in the library', () => {
    for (const p of builtInPrograms)
      for (const d of p.days)
        for (const e of d.exercises) expect(ids.has(e.exerciseId), `${p.id}/${d.id}/${e.exerciseId}`).toBe(true)
  })
  it('program exercises all have demo images', () => {
    expect(library.length).toBeGreaterThan(800)
    const byId = new Map(library.map((e) => [e.id, e]))
    for (const p of builtInPrograms)
      for (const d of p.days)
        for (const e of d.exercises)
          expect(byId.get(e.exerciseId)?.images.length, e.exerciseId).toBeGreaterThanOrEqual(2)
  })
})

describe('David Laid cyclic programs', () => {
  const cyclic = builtInPrograms.filter((p) => p.weeks)
  const byId = new Map(builtInPrograms.map((p) => [p.id, p]))

  it('registers Program 1 and the PPL split as sequential 4-week cycles', () => {
    const p1 = byId.get('david-laid-program-1')!
    const ppl = byId.get('david-laid-ppl')!
    expect(p1).toMatchObject({ schedule: 'sequential', weeks: 4 })
    expect(p1.days.map((d) => d.name)).toEqual(['Ноги', 'Жим 1', 'Тяга 1', 'Жим 2', 'Тяга 2'])
    expect(ppl).toMatchObject({ schedule: 'sequential', weeks: 4 })
    expect(ppl.days).toHaveLength(6)
    expect(byId.get('david-laid-dup')).toBeDefined()
    expect(p1.pctTable).toEqual({
      '10': 0.6,
      '8': 0.7,
      '6': 0.8,
      '5': 0.8,
      '4': 0.85,
      '3': 0.9,
      '2': 0.92,
      '1': 0.95,
    })
  })

  it('every exercise has a weekly array of the cycle length and schemes match the set count', () => {
    expect(cyclic.length).toBe(2)
    for (const p of cyclic)
      for (const d of p.days)
        for (const e of d.exercises) {
          const where = `${p.id}/${d.id}/${e.name}`
          expect(e.weekly?.length, where).toBe(4)
          for (const w of e.weekly ?? []) {
            if (w.sets === 0) continue
            expect(w.scheme?.length, where).toBe(w.sets)
            for (const t of w.scheme ?? []) if (t.pct != null) expect(t.pct, where).toBeGreaterThan(0)
          }
        }
  })

  it('max lifts and maxLiftIds exist in the library', () => {
    for (const p of cyclic) {
      for (const m of p.maxLifts ?? []) expect(ids.has(m.exerciseId), m.exerciseId).toBe(true)
      for (const d of p.days)
        for (const e of d.exercises) if (e.maxLiftId) expect(ids.has(e.maxLiftId), e.maxLiftId).toBe(true)
    }
  })

  it('encodes Program 1 rep schemes with the %-table', () => {
    const p1 = byId.get('david-laid-program-1')!
    const squat = p1.days[0].exercises[0]
    expect(squat.weekly!.map((w) => w.scheme!.map((t) => `${t.reps}@${t.pct}`).join(' '))).toEqual([
      '10@0.6 8@0.7 6@0.8',
      '4@0.85 4@0.85 2@0.92',
      '5@0.8 3@0.9 1@0.95',
      '1@1',
    ])
    expect(squat.weekly![3].scheme![0].note).toContain('работай до нового максимума')
    // accessories carry no %
    const calves = p1.days[0].exercises.find((e) => e.exerciseId === 'Smith_Machine_Calf_Raise')!
    expect(calves.weekly![0].scheme!.map((t) => [t.reps, t.pct])).toEqual([
      ['40', undefined],
      ['30', undefined],
      ['20', undefined],
    ])
    // to failure ×2 with 2 min rest
    const pushups = p1.days[1].exercises.find((e) => e.exerciseId === 'Pushups')!
    expect(pushups).toMatchObject({ sets: 2, reps: 'AMRAP', restSec: 120 })
    // ATG squat: heavy single at 95 % of the squat max
    const atg = p1.days[3].exercises[0]
    expect(atg).toMatchObject({ exerciseId: 'Barbell_Full_Squat', maxLiftId: 'Barbell_Squat' })
    expect(atg.weekly!.every((w) => w.sets === 1 && w.scheme![0].pct === 0.95)).toBe(true)
    // pause squats use the squat max; front squats are not done in week 4
    expect(p1.days[2].exercises[1]).toMatchObject({
      exerciseId: 'Barbell_Squat',
      maxLiftId: 'Barbell_Squat',
      name: 'Присед с паузой',
    })
    expect(p1.days[4].exercises[1].weekly![3].sets).toBe(0)
  })

  it('encodes the PPL progression, heavy singles, static holds and default accessories', () => {
    const ppl = byId.get('david-laid-ppl')!
    const squat = ppl.days[0].exercises[0]
    expect(squat.weekly!.map((w) => `${w.sets}`)).toEqual(['5', '5', '6', '7'])
    expect(squat.weekly![0].scheme![0]).toMatchObject({ reps: '1', pct: 0.95 })
    expect(squat.weekly![3].scheme!.every((t) => t.reps === '3' && t.pct === 0.9)).toBe(true)
    const hold = ppl.days[0].exercises[1]
    expect(hold.weekly![0]).toMatchObject({ sets: 3, reps: '45-60 с' })
    expect(hold.weekly![0].scheme!.every((t) => t.pct === 1.2)).toBe(true)
    expect(ppl.days[0].notes).toContain('выбери два')
    expect(ppl.days[0].exercises.map((e) => e.exerciseId)).toEqual(
      expect.arrayContaining(['Leg_Press', 'Dumbbell_Lunges']),
    )
    const pullups = ppl.days[2].exercises.find((e) => e.exerciseId === 'Pullups')!
    expect(pullups).toMatchObject({ sets: 3, reps: '10-15' })
  })
})
