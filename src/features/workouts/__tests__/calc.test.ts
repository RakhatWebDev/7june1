import { describe, expect, it } from 'vitest'
import { davidLaidDup } from '../../../data/programs/davidLaidDup'
import { weekdayProgram } from './fixtures'
import {
  buildAliasMap,
  buildSessionFromDay,
  doneSetCount,
  epley1RM,
  exerciseHistory,
  filterExercises,
  formatClock,
  formatPerformance,
  isStartableDay,
  lastPerformance,
  newRecords,
  occurrenceIndex,
  scheduledDay,
  sessionDurationMin,
  sessionVolume,
  setVolume,
} from '../calc'
import { makeExercise, makeSession, set } from './helpers'

describe('volume and 1RM', () => {
  it('counts weight × reps only for done, non-warm-up sets', () => {
    expect(setVolume(set(100, 5))).toBe(500)
    expect(setVolume(set(100, 5, false))).toBe(0)
    expect(setVolume(set(60, 10, true, { warmup: true }))).toBe(0)
    expect(setVolume(set(null, 10))).toBe(0)
    const s = makeSession({
      id: 's',
      exercises: [
        { exerciseId: 'a', name: 'A', targetSets: 3, targetReps: '5', sets: [set(80, 5), set(80, 5), set(80, 4, false)] },
        { exerciseId: 'b', name: 'B', targetSets: 2, targetReps: '10', sets: [set(20, 10, true, { warmup: true }), set(22.5, 10)] },
      ],
    })
    expect(sessionVolume(s)).toBe(80 * 5 * 2 + 225)
    expect(doneSetCount(s)).toBe(3)
  })

  it('computes Epley 1RM as w × (1 + reps/30)', () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.667, 2)
    expect(epley1RM(100, 30)).toBe(200)
    expect(epley1RM(0, 5)).toBe(0)
    expect(epley1RM(100, 0)).toBe(0)
  })

  it('measures duration and formats clocks', () => {
    expect(sessionDurationMin({ startedAt: '2026-10-01T10:00:00Z', finishedAt: '2026-10-01T11:05:30Z' })).toBe(66)
    expect(sessionDurationMin({ startedAt: '2026-10-01T10:00:00Z' }, new Date('2026-10-01T10:30:00Z'))).toBe(30)
    expect(formatClock(90)).toBe('1:30')
    expect(formatClock(5)).toBe('0:05')
  })
})

describe('program days', () => {
  it('finds the scheduled day and builds a session with empty sets', () => {
    const monday = scheduledDay(weekdayProgram, 0)!
    expect(monday.id).toBe('legs-1')
    const sunday = scheduledDay(weekdayProgram, 6)!
    expect(isStartableDay(sunday)).toBe(false)
    const s = buildSessionFromDay(weekdayProgram, monday, 'x', new Date('2026-10-05T08:00:00Z'))
    expect(s.exercises).toHaveLength(monday.exercises.length)
    s.exercises.forEach((e, i) => {
      expect(e.targetSets).toBe(monday.exercises[i].sets)
      expect(e.targetReps).toBe(monday.exercises[i].reps)
      expect(e.restSec).toBe(monday.exercises[i].restSec)
      expect(e.sets).toHaveLength(monday.exercises[i].sets)
      expect(e.sets.every((x) => !x.done && x.weightKg === null && x.reps === null)).toBe(true)
    })
    expect(s.finishedAt).toBeUndefined()
  })

  it('uses the program-week prescription of a 12-week program (DUP deload in week 6)', () => {
    const day = davidLaidDup.days[0]
    const normal = buildSessionFromDay(davidLaidDup, day, 'a', new Date(), { week: 0, programSession: 2 })
    const deload = buildSessionFromDay(davidLaidDup, day, 'b', new Date(), { week: 5 })
    expect(normal).toMatchObject({ programWeek: 0, programSession: 2 })
    expect(normal.exercises[0].targetSets).toBe(5)
    expect(deload.exercises[0].targetSets).toBe(3) // 5 × 0.65 → 3
    expect(deload.exercises.every((e) => e.targetSets >= 2)).toBe(true)
    expect(deload.exercises[0].notes).toContain('разгрузка')
  })
})

describe('history helpers', () => {
  const squat = (sets: ReturnType<typeof set>[]) => ({ exerciseId: 'sq', name: 'Присед', targetSets: 3, targetReps: '5', sets })
  const older = makeSession({ id: 'old', startedAt: '2026-09-01T10:00:00Z', exercises: [squat([set(70, 5), set(70, 5)])] })
  const prev = makeSession({
    id: 'prev',
    startedAt: '2026-09-28T10:00:00Z',
    exercises: [squat([set(80, 5), set(80, 5), set(80, 5)]), squat([set(60, 8), set(60, 8)])],
  })
  const active = makeSession({ id: 'cur', startedAt: '2026-10-05T10:00:00Z', finishedAt: undefined, exercises: [squat([set(85, 5)])] })
  const all = [older, prev, active]

  it('finds the last finished performance, matching repeated entries by occurrence', () => {
    const last = lastPerformance(all, 'sq', { excludeSessionId: 'cur' })!
    expect(last.sessionId).toBe('prev')
    expect(formatPerformance(last.sets)).toBe('80 кг × 5, 5, 5')
    const second = lastPerformance(all, 'sq', { excludeSessionId: 'cur', occurrence: 1 })!
    expect(formatPerformance(second.sets)).toBe('60 кг × 8, 8')
    expect(lastPerformance(all, 'nope')).toBeNull()
    expect(occurrenceIndex(prev.exercises, 1)).toBe(1)
  })

  it('formats mixed weights grouped', () => {
    expect(formatPerformance([{ weightKg: 80, reps: 5 }, { weightKg: 82.5, reps: 3 }])).toBe('80 кг × 5 · 82,5 кг × 3')
  })

  it('detects new records against earlier sessions only', () => {
    const finished = { ...active, finishedAt: '2026-10-05T11:00:00Z' }
    const recs = newRecords(finished, [older, prev, finished])
    expect(recs).toHaveLength(1)
    expect(recs[0].weightKg).toEqual({ value: 85, prev: 80 })
    expect(recs[0].oneRM?.value).toBeCloseTo(epley1RM(85, 5))
    // First time an exercise is logged is not a record
    expect(newRecords(older, all)).toHaveLength(0)
  })

  it('lists the exercise history newest first with a limit', () => {
    const h = exerciseHistory(all, 'sq', 2)
    expect(h.map((x) => x.sessionId)).toEqual(['cur', 'prev'])
    expect(h[1].sets).toHaveLength(5)
  })
})

describe('filterExercises', () => {
  const list = [
    makeExercise({ id: 'Barbell_Bench_Press', primaryMuscles: ['chest'], equipment: 'barbell' }),
    makeExercise({ id: 'Dumbbell_Curl', primaryMuscles: ['biceps'], equipment: 'dumbbell' }),
    makeExercise({ id: 'Hamstring_Stretch', primaryMuscles: ['hamstrings'], equipment: null, category: 'stretching' }),
  ]
  it('searches case-insensitively, including Russian aliases, and applies filters', () => {
    expect(filterExercises(list, { query: 'BENCH' }).map((e) => e.id)).toEqual(['Barbell_Bench_Press'])
    const aliases = new Map([['Barbell_Bench_Press', ['Жим лёжа']]])
    expect(filterExercises(list, { query: 'жим' }, aliases)).toHaveLength(1)
    expect(filterExercises(list, { muscle: 'biceps' }).map((e) => e.id)).toEqual(['Dumbbell_Curl'])
    expect(filterExercises(list, { equipment: 'barbell' })).toHaveLength(1)
    expect(filterExercises(list, { category: 'stretching' }).map((e) => e.id)).toEqual(['Hamstring_Stretch'])
    expect(filterExercises(list, { query: 'curl', equipment: 'barbell' })).toHaveLength(0)
  })
  it('builds aliases from program display names', () => {
    const m = buildAliasMap([davidLaidDup])
    expect(m.get('Barbell_Squat')).toContain('Присед со штангой (тяжёлый)')
  })
})
