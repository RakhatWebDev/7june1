import { describe, expect, it } from 'vitest'
import { davidLaidDup } from '../../data/programs/davidLaidDup'
import type { Program } from '../../db/types'
import { greeting, pickProgram, scheduledDay, sessionVolume, weeklyProgress } from './calc'

const custom: Program = { ...davidLaidDup, id: 'custom', name: 'Моя', isBuiltIn: false }

describe('today calc', () => {
  it('greets by time of day', () => {
    expect(greeting(7)).toBe('Доброе утро')
    expect(greeting(13)).toBe('Добрый день')
    expect(greeting(20)).toBe('Добрый вечер')
    expect(greeting(2)).toBe('Доброй ночи')
    expect(greeting(23)).toBe('Доброй ночи')
  })

  it('picks the active program from settings, else the first built-in', () => {
    expect(pickProgram([custom, davidLaidDup], 'custom')?.id).toBe('custom')
    expect(pickProgram([custom, davidLaidDup], 'missing')?.id).toBe('david-laid-dup')
    expect(pickProgram([custom, davidLaidDup])?.id).toBe('david-laid-dup')
    expect(pickProgram([custom])?.id).toBe('custom')
    expect(pickProgram([])).toBeUndefined()
  })

  it('finds the scheduled day by Monday-based weekday', () => {
    expect(scheduledDay(davidLaidDup, 0)?.id).toBe('legs-1')
    expect(scheduledDay(davidLaidDup, 6)?.type).toBe('rest')
    expect(scheduledDay(undefined, 0)).toBeUndefined()
  })

  it('formats the weekly progress and flags extra sessions', () => {
    expect(weeklyProgress(1, 3)).toEqual({ text: 'На этой неделе 1 из 3', extra: false })
    expect(weeklyProgress(3, 3).extra).toBe(true)
  })

  it('computes session volume from done working sets', () => {
    expect(
      sessionVolume({
        exercises: [
          {
            exerciseId: 'x',
            name: 'x',
            targetSets: 3,
            targetReps: '5',
            sets: [
              { weightKg: 50, reps: 5, done: true, warmup: true },
              { weightKg: 100, reps: 5, done: true },
              { weightKg: 100, reps: 5, done: false },
            ],
          },
        ],
      }),
    ).toBe(500)
  })
})
