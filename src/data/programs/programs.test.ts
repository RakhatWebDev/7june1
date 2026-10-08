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

describe('built-in programs: 3 sessions × 12 weeks', () => {
  const byId = new Map(builtInPrograms.map((p) => [p.id, p]))
  const p1 = byId.get('david-laid-program-1')!
  const ppl = byId.get('david-laid-ppl')!
  const dup = byId.get('david-laid-dup')!
  /** "reps@pct" per set of one program week */
  const sig = (e: { weekly?: { scheme?: { reps: string; pct?: number }[] }[] }, w: number) =>
    (e.weekly![w].scheme ?? []).map((t) => (t.pct != null ? `${t.reps}@${t.pct}` : t.reps)).join(' ')

  it('all built-ins are sequential 12-week programs of 3 sessions with a 6-session rotation', () => {
    expect(builtInPrograms.map((p) => p.id).sort()).toEqual([
      'david-laid-dup',
      'david-laid-ppl',
      'david-laid-program-1',
    ])
    for (const p of builtInPrograms) {
      expect(p, p.id).toMatchObject({
        schedule: 'sequential',
        weeks: 12,
        sessionsPerWeek: 3,
        daysPerWeek: 3,
        version: 2,
      })
      expect(p.days, p.id).toHaveLength(6)
      expect(
        p.days.every((d) => d.weekday == null && d.type !== 'rest'),
        p.id,
      ).toBe(true)
      expect(new Set(p.days.map((d) => d.id)).size, p.id).toBe(6)
    }
    expect(p1.days.map((d) => d.name)).toEqual(['Ноги', 'Жим 1', 'Тяга 1', 'Ноги', 'Жим 2', 'Тяга 2'])
    expect(ppl.days.map((d) => d.name)).toEqual(['Ноги 1', 'Жим 1', 'Тяга 1', 'Ноги 2', 'Жим 2', 'Тяга 2'])
    expect(dup.days.map((d) => d.id)).toEqual(['legs-1', 'push-1', 'pull-1', 'legs-2', 'push-2', 'pull-2'])
    expect(p1.pctTable).toEqual({ '10': 0.6, '8': 0.7, '6': 0.8, '5': 0.8, '4': 0.85, '3': 0.9, '2': 0.92, '1': 0.95 })
  })

  it('every exercise of every program has 12 weekly entries; schemes match the set count', () => {
    for (const p of builtInPrograms)
      for (const d of p.days)
        for (const e of d.exercises) {
          const where = `${p.id}/${d.id}/${e.name}`
          expect(e.weekly?.length, where).toBe(12)
          for (const w of e.weekly ?? []) {
            if (w.sets === 0) continue
            expect(w.scheme?.length, where).toBe(w.sets)
            for (const t of w.scheme ?? []) if (t.pct != null) expect(t.pct, where).toBeGreaterThan(0)
          }
        }
  })

  it('max lifts and maxLiftIds exist in the library', () => {
    for (const p of builtInPrograms) {
      for (const m of p.maxLifts ?? []) expect(ids.has(m.exerciseId), m.exerciseId).toBe(true)
      for (const d of p.days)
        for (const e of d.exercises) if (e.maxLiftId) expect(ids.has(e.maxLiftId), e.maxLiftId).toBe(true)
    }
  })

  it('Program 1: document weeks doubled, test week 9, document weeks 1–3 again', () => {
    const squat = p1.days[0].exercises[0]
    const weeks = Array.from({ length: 12 }, (_, w) => sig(squat, w))
    const W1 = '10@0.6 8@0.7 6@0.8'
    const W2 = '4@0.85 4@0.85 2@0.92'
    const W3 = '5@0.8 3@0.9 1@0.95'
    expect(weeks).toEqual([W1, W1, W2, W2, W3, W3, '1@1', '1@1', '1@1', W1, W2, W3])
    expect(squat.weekly![6].scheme![0].note).toContain('работай до нового максимума')
    expect(squat.weekly![8].scheme![0].note).toContain('тестовая неделя')
    // the legs day appears twice in the rotation with the same content
    expect(p1.days[3].exercises).toEqual(p1.days[0].exercises)
    // accessories: no %, light 2×10 in the test week
    const calves = p1.days[0].exercises.find((e) => e.exerciseId === 'Smith_Machine_Calf_Raise')!
    expect(sig(calves, 0)).toBe('40 30 20')
    expect(calves.weekly![8]).toMatchObject({ sets: 2, reps: '10' })
    const pushups = p1.days[1].exercises.find((e) => e.exerciseId === 'Pushups')!
    expect(pushups).toMatchObject({ sets: 2, reps: 'AMRAP', restSec: 120 })
    // push press: MAX in document week 1 → program weeks 1–2 and 10
    const pushPress = p1.days[1].exercises[0]
    expect([0, 1, 9].map((w) => sig(pushPress, w))).toEqual(['1@1', '1@1', '1@1'])
    expect(sig(pushPress, 2)).toBe(W1)
    // ATG squat: heavy single on the squat max; front squat not in document week 4 → weeks 7–8 off
    const atg = p1.days[4].exercises[0]
    expect(atg).toMatchObject({ exerciseId: 'Barbell_Full_Squat', maxLiftId: 'Barbell_Squat' })
    expect(sig(atg, 0)).toBe('1@0.95')
    expect(p1.days[2].exercises[1]).toMatchObject({
      exerciseId: 'Barbell_Squat',
      maxLiftId: 'Barbell_Squat',
      name: 'Присед с паузой',
    })
    const front = p1.days[5].exercises[1]
    expect([6, 7].map((w) => front.weekly![w].sets)).toEqual([0, 0])
    expect(front.weekly![8].sets).toBe(1)
    expect(p1.blocks?.find((b) => b.test)).toMatchObject({ fromWeek: 8, toWeek: 8 })
    expect(p1.blocks?.[0].label).toBe('Блок 1 · 10-8-6')
  })

  it('PPL: progression in 2-week blocks, heavy singles, holds skipped in the test week', () => {
    const squat = ppl.days[0].exercises[0]
    expect(squat.weekly!.map((w) => w.sets)).toEqual([5, 5, 5, 5, 6, 6, 7, 7, 1, 5, 5, 6])
    expect(squat.weekly![0].scheme![0]).toMatchObject({ reps: '1', pct: 0.95 })
    expect(squat.weekly![6].scheme!.every((t) => t.reps === '3' && t.pct === 0.9)).toBe(true)
    const hold = ppl.days[0].exercises[1]
    expect(hold.weekly![0]).toMatchObject({ sets: 3, reps: '45-60 с' })
    expect(hold.weekly![0].scheme!.every((t) => t.pct === 1.2)).toBe(true)
    expect(hold.weekly![8].sets).toBe(0)
    expect(ppl.days[0].notes).toContain('выбери два')
    expect(ppl.days[0].exercises.map((e) => e.exerciseId)).toEqual(
      expect.arrayContaining(['Leg_Press', 'Dumbbell_Lunges']),
    )
    const pullups = ppl.days[2].exercises.find((e) => e.exerciseId === 'Pullups')!
    expect(pullups).toMatchObject({ sets: 3, reps: '10-15' })
  })

  it('DUP: base prescription every week, deload (−35 % sets, min 2) in weeks 6 and 12', () => {
    for (const d of dup.days)
      for (const e of d.exercises)
        e.weekly!.forEach((w, i) => {
          if (i === 5 || i === 11) {
            expect(w.sets).toBe(Math.max(2, Math.round(e.sets * 0.65)))
            expect(w.notes).toContain('разгрузка')
          } else expect(w).toMatchObject({ sets: e.sets, reps: e.reps })
        })
    expect(dup.cycleNotes).toContain('дня отдыха в круге нет')
  })
})
