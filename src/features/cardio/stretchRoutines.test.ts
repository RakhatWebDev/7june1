import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../db/types'
import { routineDurationSec, stretchRoutines } from './stretchRoutines'

const library = JSON.parse(readFileSync('public/data/exercises.json', 'utf8')) as Exercise[]
const byId = new Map(library.map((e) => [e.id, e]))

function primaryMuscles(routineId: string): Set<string> {
  const r = stretchRoutines.find((x) => x.id === routineId)!
  return new Set(r.steps.flatMap((s) => byId.get(s.exerciseId)?.primaryMuscles ?? []))
}

describe('stretch routines', () => {
  it('has the three built-in routines', () => {
    expect(stretchRoutines.map((r) => r.name)).toEqual(['После ног', 'После верха', 'Утренняя мобилити'])
  })

  it('reference only library exercises with category stretching and demo images', () => {
    expect(library.length).toBeGreaterThan(800)
    for (const r of stretchRoutines) {
      expect(r.steps.length).toBeGreaterThan(0)
      for (const s of r.steps) {
        const ex = byId.get(s.exerciseId)
        expect(ex, `${r.id}/${s.exerciseId} exists`).toBeDefined()
        expect(ex?.category, `${r.id}/${s.exerciseId} category`).toBe('stretching')
        expect(ex?.images.length, `${r.id}/${s.exerciseId} images`).toBeGreaterThanOrEqual(1)
        expect(s.nameRu.length).toBeGreaterThan(0)
        expect(s.holdSec).toBeGreaterThan(0)
      }
    }
  })

  it('"После ног" targets quads, hamstrings, calves, glutes and lower back', () => {
    const m = primaryMuscles('after-legs')
    for (const muscle of ['quadriceps', 'hamstrings', 'calves', 'glutes', 'lower back']) expect(m, muscle).toContain(muscle)
  })

  it('"После верха" targets chest, shoulders, lats, triceps and neck', () => {
    const m = primaryMuscles('after-upper')
    for (const muscle of ['chest', 'shoulders', 'lats', 'triceps', 'neck']) expect(m, muscle).toContain(muscle)
  })

  it('"Утренняя мобилити" lasts 8–10 minutes', () => {
    const r = stretchRoutines.find((x) => x.id === 'morning-mobility')!
    const sec = routineDurationSec(r)
    expect(sec).toBeGreaterThanOrEqual(8 * 60)
    expect(sec).toBeLessThanOrEqual(10 * 60)
  })
})
