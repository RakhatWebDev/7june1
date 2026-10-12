import { describe, expect, it } from 'vitest'
import { browseExercises, equipmentGroupOf, equipmentGroupsIn, inMuscleGroup, muscleGroupOf } from '../categories'
import { makeExercise } from './helpers'

const lib = [
  makeExercise({ id: 'Squat', primaryMuscles: ['quadriceps'] }),
  makeExercise({ id: 'Leg_Press', primaryMuscles: ['quadriceps'], equipment: 'machine', images: [] }),
  makeExercise({ id: 'Calf', primaryMuscles: ['calves'], equipment: 'machine' }),
  makeExercise({ id: 'Curl', primaryMuscles: ['biceps'], equipment: 'e-z curl bar' }),
  makeExercise({ id: 'Row', primaryMuscles: ['lats'], equipment: 'cable' }),
  makeExercise({ id: 'Jog', primaryMuscles: ['quadriceps'], category: 'cardio', equipment: null }),
  makeExercise({ id: 'Quad_Stretch', primaryMuscles: ['quadriceps'], category: 'stretching' }),
]

describe('categories', () => {
  it('groups muscles and equipment', () => {
    expect(muscleGroupOf(lib[0])).toBe('legs')
    expect(muscleGroupOf(lib[4])).toBe('back')
    expect(muscleGroupOf(lib[5])).toBe('cardio')
    expect(inMuscleGroup(lib[5], 'legs')).toBe(false)
    expect(inMuscleGroup(lib[6], 'legs')).toBe(false)
    expect(equipmentGroupOf(lib[3])).toBe('barbell')
    expect(equipmentGroupOf(lib[5])).toBe('other')
    expect(equipmentGroupsIn(lib, 'legs')).toEqual(['barbell', 'machine'])
  })

  it('browses a group: popular (aliased) first, then with images; filters by equipment and query', () => {
    const aliases = new Map([['Leg_Press', ['Жим ногами']]])
    expect(browseExercises(lib, aliases, { group: 'legs' }).map((e) => e.id)).toEqual(['Leg_Press', 'Calf', 'Squat'])
    expect(browseExercises(lib, aliases, { group: 'legs', equipment: 'machine' }).map((e) => e.id)).toEqual([
      'Leg_Press',
      'Calf',
    ])
    expect(browseExercises(lib, aliases, { group: 'legs', query: 'ногами' }).map((e) => e.id)).toEqual(['Leg_Press'])
    expect(browseExercises(lib, aliases, { group: 'biceps', query: 'squat' })).toEqual([])
    expect(browseExercises(lib, aliases, { query: 'squat', excludeId: 'Squat' })).toEqual([])
    expect(browseExercises(lib, aliases, { limit: 2 })).toHaveLength(2)
  })
})
