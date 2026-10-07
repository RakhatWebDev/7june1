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
        for (const e of d.exercises) expect(byId.get(e.exerciseId)?.images.length, e.exerciseId).toBeGreaterThanOrEqual(2)
  })
})
