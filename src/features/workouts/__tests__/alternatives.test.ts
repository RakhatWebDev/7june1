import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../../db/types'
import { CURATED_ALTERNATIVES, rankAlternatives, similarity } from '../alternatives'
import { makeExercise } from './helpers'

const library = JSON.parse(readFileSync('public/data/exercises.json', 'utf8')) as Exercise[]
const byId = new Map(library.map((e) => [e.id, e]))

describe('exercise alternatives', () => {
  it('curated ids (keys and suggestions) exist in the library', () => {
    for (const [id, alts] of Object.entries(CURATED_ALTERNATIVES)) {
      expect(byId.has(id), id).toBe(true)
      for (const a of alts) expect(byId.has(a), `${id} → ${a}`).toBe(true)
    }
  })

  it('puts curated alternatives first for the main lifts', () => {
    const squat = rankAlternatives(byId.get('Barbell_Squat')!, library)
    expect(squat).toHaveLength(8)
    expect(squat.slice(0, 3).map((e) => e.id)).toEqual(['Leg_Press', 'Front_Barbell_Squat', 'Hack_Squat'])
    expect(rankAlternatives(byId.get('Push_Press')!, library)[0].id).toBe('Standing_Military_Press')
    expect(rankAlternatives(byId.get('Weighted_Pull_Ups')!, library)[0].id).toBe('Wide-Grip_Lat_Pulldown')
    expect(rankAlternatives(byId.get('Dips_-_Triceps_Version')!, library)[0].id).toBe('Close-Grip_Barbell_Bench_Press')
    expect(squat.map((e) => e.id)).not.toContain('Barbell_Squat')
  })

  it('ranks by shared muscles, then force and mechanic, with equipment variety among equals', () => {
    const target = makeExercise({
      id: 'T',
      primaryMuscles: ['biceps'],
      force: 'pull',
      mechanic: 'isolation',
      equipment: 'barbell',
    })
    const lib = [
      target,
      makeExercise({ id: 'Chest', primaryMuscles: ['chest'], force: 'push', mechanic: 'compound' }),
      makeExercise({
        id: 'B_push',
        primaryMuscles: ['biceps'],
        force: 'push',
        mechanic: 'compound',
        equipment: 'cable',
      }),
      makeExercise({
        id: 'B_pull_db',
        primaryMuscles: ['biceps'],
        force: 'pull',
        mechanic: 'isolation',
        equipment: 'dumbbell',
      }),
      makeExercise({
        id: 'B_pull_bb',
        primaryMuscles: ['biceps'],
        force: 'pull',
        mechanic: 'isolation',
        equipment: 'barbell',
      }),
      makeExercise({
        id: 'B_pull_bb2',
        primaryMuscles: ['biceps'],
        force: 'pull',
        mechanic: 'isolation',
        equipment: 'barbell',
      }),
      makeExercise({ id: 'B_stretch', primaryMuscles: ['biceps'], category: 'stretching' }),
    ]
    expect(similarity(target, lib[3])).toBeGreaterThan(similarity(target, lib[2]))
    const ids = rankAlternatives(target, lib).map((e) => e.id)
    expect(ids).not.toContain('Chest')
    expect(ids).not.toContain('B_stretch')
    expect(ids).not.toContain('T')
    // same score: barbell, dumbbell, barbell2 → the first pick can be any; the second must vary equipment
    expect(ids.slice(0, 3)).toHaveLength(3)
    expect(new Set(ids.slice(0, 2).map((id) => lib.find((e) => e.id === id)!.equipment)).size).toBe(2)
    expect(ids[3]).toBe('B_push')
  })
})
