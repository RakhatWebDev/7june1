import { describe, expect, it } from 'vitest'
import type { SessionExercise, SetLog, WorkoutSession } from '../../../db/types'
import { davidLaidProgram1 } from '../../../data/programs/davidLaidProgram1'
import {
  accessoryIncrement,
  computeNextTargets,
  estimate1RM,
  hintTrend,
  maxUpdateSuggestions,
  nextTimePreview,
  parseReps,
} from '../autoreg'

const s = (weightKg: number | null, reps: number | null, done = true): SetLog => ({
  weightKg,
  reps,
  done,
})
const SQUAT = 'Barbell_Squat'
const scheme1086 = [
  { reps: '10', pct: 0.6 },
  { reps: '8', pct: 0.7 },
  { reps: '6', pct: 0.8 },
]
/** Last squat session: 10-8-6 prescribed at 35/42,5/47,5 (training max 60). */
const lastSquat = (sets: SetLog[]): SessionExercise => ({
  exerciseId: SQUAT,
  name: 'Присед',
  targetSets: 3,
  targetReps: '10-8-6',
  targets: [
    { reps: '10', pct: 0.6, weightKg: 35 },
    { reps: '8', pct: 0.7, weightKg: 42.5 },
    { reps: '6', pct: 0.8, weightKg: 47.5 },
  ],
  sets,
})
const squatInput = (history: SessionExercise[], trainingMaxes: Record<string, number> = { [SQUAT]: 60 }) => ({
  programExercise: { exerciseId: SQUAT, name: 'Присед' },
  prescription: { sets: 3, reps: '10-8-6', scheme: scheme1086 },
  history,
  maxes: { [SQUAT]: 60 },
  trainingMaxes,
})

describe('autoreg helpers', () => {
  it('estimates 1RM with Epley and parses rep prescriptions', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1)
    expect(estimate1RM(0, 5)).toBe(0)
    expect(parseReps('10')).toEqual({ min: 10, max: 10 })
    expect(parseReps('10-15')).toEqual({ min: 10, max: 15 })
    expect(parseReps('AMRAP')).toBeNull()
    expect(parseReps('45-60 с')).toBeNull()
  })

  it('picks +5 kg for lower-body compounds and +2.5 kg otherwise', () => {
    expect(
      accessoryIncrement('Leg_Press', {
        primaryMuscles: ['quadriceps'],
        equipment: 'machine',
        mechanic: 'compound',
      }),
    ).toBe(5)
    expect(
      accessoryIncrement('Leg_Extensions', {
        primaryMuscles: ['quadriceps'],
        equipment: 'machine',
        mechanic: 'isolation',
      }),
    ).toBe(2.5)
    expect(accessoryIncrement('Rack_Pulls')).toBe(5)
    expect(accessoryIncrement('Side_Lateral_Raise')).toBe(2.5)
  })
})

describe('computeNextTargets — %-based lifts', () => {
  it('seeds the training max from the tested max and resolves weights from the scheme', () => {
    const r = computeNextTargets({ ...squatInput([]), trainingMaxes: {} })
    expect(r.trainingMax).toBe(60)
    expect(r.trainingMaxUpdate).toEqual({ exerciseId: SQUAT, kg: 60 })
    expect(r.targets).toEqual([
      { reps: '10', pct: 0.6, weightKg: 35 },
      { reps: '8', pct: 0.7, weightKg: 42.5 },
      { reps: '6', pct: 0.8, weightKg: 47.5 },
    ])
    expect(r.hint).toBe('Тренировочный макс. 60 кг')
  })

  it('beating the top set raises the training max, capped at +5 % per session', () => {
    // 12-10-8 at the target weights of 10-8-6: one plate step up even though 0.95 × e1RM ≈ 57 kg
    const modest = computeNextTargets(squatInput([lastSquat([s(35, 12), s(42.5, 10), s(47.5, 8)])]))
    expect(modest.trend).toBe('up')
    expect(modest.trainingMax).toBe(62.5)
    // a huge beat is still capped at 60 × 1.05 = 63 → 62,5
    const big = computeNextTargets(squatInput([lastSquat([s(35, 10), s(42.5, 8), s(70, 8)])]))
    expect(big.trainingMax).toBe(62.5)
    expect(big.trainingMaxUpdate).toEqual({ exerciseId: SQUAT, kg: 62.5 })
    expect(big.targets.map((t) => t.weightKg)).toEqual([37.5, 45, 50])
    expect(big.targets.map((t) => t.reps)).toEqual(['10', '8', '6']) // reps of %-schemes never change
    expect(big.hint).toMatch(
      /^↑ Тренировочный макс\. 62,5 кг \(было 60\): в прошлый раз 8 × 70 с запасом → цели выросли$/,
    )
    expect(hintTrend(big.hint)).toBe('up')
  })

  it('missing two prescribed sets lowers the training max by 5 %', () => {
    const r = computeNextTargets(squatInput([lastSquat([s(35, 10), s(42.5, 6), s(47.5, 3, false)])]))
    expect(r.trend).toBe('down')
    expect(r.trainingMax).toBe(57.5)
    expect(r.targets.map((t) => t.weightKg)).toEqual([35, 40, 45])
    expect(r.hint).toContain('не добрал 2 подхода')
    expect(hintTrend(r.hint)).toBe('down')
  })

  it('keeps the training max when the plan was done exactly', () => {
    const r = computeNextTargets(squatInput([lastSquat([s(35, 10), s(42.5, 8), s(47.5, 6)])]))
    expect(r.trend).toBe('same')
    expect(r.trainingMax).toBe(60)
    expect(r.trainingMaxUpdate).toBeUndefined()
    expect(r.hint).toMatch(/^= Тренировочный макс\. 60 кг/)
  })

  it('static holds use 120 % of the training max and never move it', () => {
    const r = computeNextTargets({
      programExercise: { exerciseId: SQUAT, name: 'Удержание', maxLiftId: SQUAT },
      prescription: {
        sets: 3,
        reps: '45-60 с',
        scheme: Array.from({ length: 3 }, () => ({ reps: '45-60 с', pct: 1.2 })),
      },
      history: [],
      maxes: { [SQUAT]: 60 },
      trainingMaxes: { [SQUAT]: 60 },
    })
    expect(r.mode).toBe('hold')
    expect(r.targets[0]).toEqual({ reps: '45-60 с', pct: 1.2, weightKg: 72.5 })
    expect(r.trainingMaxUpdate).toBeUndefined()
  })

  it('asks for a max when there is none', () => {
    const r = computeNextTargets({ ...squatInput([]), maxes: {}, trainingMaxes: {} })
    expect(r.targets[0]).toEqual({ reps: '10', pct: 0.6 })
    expect(r.hint).toContain('Мои максимумы')
  })
})

describe('computeNextTargets — accessories (double progression)', () => {
  const press = (sets: SetLog[], reps = '10'): SessionExercise => ({
    exerciseId: 'Seated_Dumbbell_Press',
    name: 'Жим гантелей сидя',
    targetSets: 3,
    targetReps: reps,
    sets,
  })
  const input = (history: SessionExercise[], reps = '10') => ({
    programExercise: { exerciseId: 'Seated_Dumbbell_Press', name: 'Жим гантелей сидя' },
    prescription: { sets: 3, reps },
    history,
    maxes: {},
    trainingMaxes: {},
    library: {
      primaryMuscles: ['shoulders'],
      equipment: 'dumbbell',
      mechanic: 'compound' as const,
    },
  })

  it('adds weight when every set hit the target', () => {
    const r = computeNextTargets(input([press([s(20, 10), s(20, 10), s(20, 11)])]))
    expect(r.trend).toBe('up')
    expect(r.targets).toEqual([0, 1, 2].map(() => ({ reps: '10', weightKg: 22.5 })))
    expect(r.hint).toContain('+2,5 кг')
  })

  it('adds 5 kg on leg press', () => {
    const r = computeNextTargets({
      programExercise: { exerciseId: 'Leg_Press', name: 'Жим ногами' },
      prescription: { sets: 3, reps: '20' },
      history: [
        {
          exerciseId: 'Leg_Press',
          name: 'Жим ногами',
          targetSets: 3,
          targetReps: '20',
          sets: [s(100, 20), s(100, 20), s(100, 20)],
        },
      ],
      maxes: {},
      trainingMaxes: {},
      library: { primaryMuscles: ['quadriceps'], equipment: 'machine', mechanic: 'compound' },
    })
    expect(r.targets[0].weightKg).toBe(105)
  })

  it('repeats the weight when reps fell a little short', () => {
    const r = computeNextTargets(input([press([s(20, 10), s(20, 9), s(20, 8)])]))
    expect(r.trend).toBe('same')
    expect(r.targets.every((t) => t.weightKg === 20)).toBe(true)
    expect(r.hint).toBe('= повтори вес 20 кг, добери повторы')
  })

  it('shows the next rep goal for range prescriptions', () => {
    const r = computeNextTargets(input([press([s(20, 12), s(20, 11), s(20, 10)], '10-15')], '10-15'))
    expect(r.targets.map((t) => t.reps)).toEqual(['13', '12', '11'])
  })

  it('drops 5 % when two sets fell short by 2+ reps', () => {
    const r = computeNextTargets(input([press([s(20, 10), s(20, 8), s(20, 7)])]))
    expect(r.trend).toBe('down')
    expect(r.targets[0].weightKg).toBe(17.5)
    expect(r.hint).toBe('↓ снизили: не добрал 2 подхода → 17,5 кг')
  })

  it('bodyweight / AMRAP: last best + 1 rep', () => {
    const r = computeNextTargets({
      programExercise: { exerciseId: 'Pullups', name: 'Подтягивания' },
      prescription: { sets: 2, reps: 'AMRAP' },
      history: [
        {
          exerciseId: 'Pullups',
          name: 'Подтягивания',
          targetSets: 2,
          targetReps: 'AMRAP',
          sets: [s(null, 9), s(null, 7)],
        },
      ],
      maxes: {},
      trainingMaxes: {},
    })
    expect(r.mode).toBe('bodyweight')
    expect(r.targets).toEqual([{ reps: '10' }, { reps: '10' }])
    expect(r.hint).toContain('цель 10')
  })

  it('no history → plain prescription without a hint', () => {
    const r = computeNextTargets(input([]))
    expect(r.targets).toEqual([{ reps: '10' }, { reps: '10' }, { reps: '10' }])
    expect(r.hint).toBe('')
  })
})

describe('session summary helpers', () => {
  const session = (exercises: SessionExercise[]): WorkoutSession => ({
    id: 'cur',
    programId: 'david-laid-program-1',
    programDayId: 'p1-push-2',
    name: 'Жим 2',
    startedAt: '2026-10-08T10:00:00.000Z',
    finishedAt: '2026-10-08T11:00:00.000Z',
    exercises,
  })

  it('suggests saving a new max after a MAX / heavy single beyond the stored max', () => {
    const out = maxUpdateSuggestions(
      session([
        {
          exerciseId: 'Barbell_Full_Squat',
          name: 'Глубокий присед (ATG)',
          targetSets: 1,
          targetReps: '1',
          targets: [{ reps: '1', pct: 0.95, weightKg: 57.5 }],
          sets: [s(65, 1)],
        },
        {
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          name: 'Жим лёжа',
          targetSets: 1,
          targetReps: '1',
          targets: [{ reps: '1', pct: 1, weightKg: 60 }],
          sets: [s(60, 1)],
        },
      ]),
      davidLaidProgram1,
      { Barbell_Squat: 60, 'Barbell_Bench_Press_-_Medium_Grip': 60 },
    )
    // ATG squat counts towards the squat max (maxLiftId); bench only matched the max
    expect(out).toEqual([{ liftId: 'Barbell_Squat', label: 'Присед', kg: 65, prev: 60 }])
  })

  it('previews next time weights with trend arrows', () => {
    const cur = session([lastSquat([s(35, 10), s(42.5, 8), s(70, 8)])])
    const out = nextTimePreview(cur, [cur], undefined, { [SQUAT]: 60 }, { [SQUAT]: 60 })
    expect(out).toEqual([{ name: 'Присед', kg: 50, trend: 'up' }])
  })
})
