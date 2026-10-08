import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FormaDB } from '../../db'
import type { FoodEntry, Habit, SessionExercise, WorkoutSession } from '../../db/types'
import {
  dismissInsight,
  generateInsights,
  pickBrief,
  rankInsights,
  ruleCardio,
  ruleDeload,
  ruleFrequency,
  ruleHabitsStreak,
  ruleNutrition,
  ruleProgression,
  ruleRecords,
  ruleSleepVolume,
  ruleStress,
  ruleWater,
  ruleWeightPlateau,
  setRuleEnabled,
  type Insight,
} from './insights'
import { adviceLabel, adviseNext, progressionAdvice } from './progression'
import { at, coachData, freshDb, localDate, profile, program, session, set } from './testUtils'
import { shiftDate } from './util'

const newest = (...s: WorkoutSession[]) => s.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
const food = (date: string, kcal: number, proteinG: number): FoodEntry => ({
  id: `${date}-${kcal}-${proteinG}`, date, meal: 'lunch', name: 'Еда', grams: 100, kcal, proteinG, carbsG: 0, fatG: 0, createdAt: at(date),
})
const ex = (targetReps: string, sets: SessionExercise['sets'], id = 'Barbell_Bench_Press_-_Medium_Grip', targetSets = 3): SessionExercise => ({
  exerciseId: id, name: 'Жим лёжа', targetSets, targetReps, sets,
})

describe('rule 1 — progression', () => {
  it('progressionAdvice: top of range → +2.5 upper / +5 lower; RPE ≤ 8 also counts', () => {
    expect(progressionAdvice(ex('6-8', [set(80, 8), set(80, 8), set(80, 8)]))).toMatchObject({ action: 'increase', nextKg: 82.5 })
    expect(progressionAdvice(ex('5', [set(100, 5), set(100, 5), set(100, 5)], 'Barbell_Squat'))).toMatchObject({ action: 'increase', nextKg: 105 })
    expect(
      progressionAdvice(ex('6-8', [set(80, 6, { rpe: 7 }), set(80, 6, { rpe: 8 }), set(80, 7, { rpe: 8 })])),
    ).toMatchObject({ action: 'increase' })
    expect(progressionAdvice(ex('6-8', [set(80, 7), set(80, 6), set(80, 6)]))).toMatchObject({ action: 'hold', nextKg: 80 })
    expect(progressionAdvice(ex('AMRAP', [set(80, 12)]))).toBeNull()
  })

  it('progressionAdvice: ≥ 2 failed sets → repeat, twice in a row → −5 %', () => {
    const failed = ex('6-8', [set(80, 6), set(80, 4), set(80, 3)])
    expect(progressionAdvice(failed)).toMatchObject({ action: 'repeat', nextKg: 80 })
    expect(progressionAdvice(failed, ex('6-8', [set(80, 5), set(80, 4)]))).toMatchObject({ action: 'decrease', nextKg: 75 })
  })

  it('adviseNext follows workouts auto-regulation, incl. %-lifts and an already-applied training max', () => {
    expect(adviseNext(ex('6-8', [set(80, 8), set(80, 8), set(80, 8)]))).toMatchObject({ action: 'increase', nextKg: 82.5 })
    const pctEx: SessionExercise = {
      exerciseId: 'Barbell_Squat', name: 'Присед', targetSets: 3, targetReps: '5',
      targets: [0, 1, 2].map(() => ({ reps: '5', pct: 0.8 })),
      sets: [set(90, 6), set(90, 6), set(90, 6)],
    }
    const fresh = adviseNext(pctEx, null, { maxes: { Barbell_Squat: 100 } })
    expect(fresh).toMatchObject({ action: 'increase', trainingMax: { from: 100, to: 102.5 } })
    expect(adviceLabel(fresh!)).toBe('ТМ 100 → 102,5 кг')
    const applied = { maxes: { Barbell_Squat: 100 }, trainingMaxes: { Barbell_Squat: 102.5 } }
    expect(adviseNext(pctEx, null, { ...applied, sessionId: 's', tmLog: { Barbell_Squat: { sessionId: 's', prevKg: 100 } } })).toMatchObject({
      trainingMax: { from: 100, to: 102.5 },
    })
    expect(adviseNext(pctEx, null, applied)?.action).toBe('hold')
  })

  it('ruleProgression summarises the last session', () => {
    const last = session('s2', '2026-10-05', [
      { exerciseId: 'Barbell_Squat', name: 'Присед', targetReps: '5', sets: [set(100, 5), set(100, 5), set(100, 5)] },
      { exerciseId: 'Leg_Extensions', name: 'Разгибания', targetReps: '10-12', sets: [set(40, 10), set(40, 11), set(40, 11)] },
    ], { programId: 'p1', programDayId: 'legs', name: 'Ноги' })
    const [ins] = ruleProgression(coachData({ sessions: [last] }))
    expect(ins.title).toContain('Прибавь вес')
    expect(ins.body).toContain('Присед: 100 → 105 кг')
    expect(ins.body).not.toContain('Разгибания')
    expect(ins.action?.to).toBe('/workouts/start/p1/legs')
    expect(ruleProgression(coachData({ sessions: [{ ...last, startedAt: at('2026-09-20') }] }))).toEqual([])
  })
})

describe('rule 2 — sleep → volume', () => {
  const nights = (mins: number[]) =>
    mins.map((m, i) => ({ id: `n${i}`, date: shiftDate('2026-10-07', -i), bedtime: at('2026-10-06', 23), wakeTime: at('2026-10-07', 6), durationMin: m, quality: 3 as const }))

  it('short night on a training day → trim accessories, priority 1', () => {
    const [ins] = ruleSleepVolume(coachData({ sleep: nights([330, 450]) }))
    expect(ins.priority).toBe(1)
    expect(ins.body).toContain('Махи в стороны')
    expect(ins.evidence[0]).toBe('Сон прошлой ночи: 5 ч 30 мин')
  })

  it('heavy leg day adds "не иди на рекорд"; enough sleep → nothing', () => {
    const mon = coachData({ now: localDate('2026-10-05', 8), sleep: nights([0, 0]).map((n, i) => ({ ...n, date: shiftDate('2026-10-05', -i), durationMin: 370 })) })
    expect(ruleSleepVolume(mon)[0].body).toContain('не иди на рекорд')
    expect(ruleSleepVolume(coachData({ sleep: nights([450, 420, 430]) }))).toEqual([])
  })
})

describe('rule 3 — calories and protein', () => {
  it('7-day kcal deviation > 15 % and protein < 80 % three days in a row', () => {
    const d = coachData({ foods: [{ id: 'c', name: 'Творог', kcal: 120, proteinG: 17, carbsG: 3, fatG: 5 }] })
    const kcal = Math.round(d.targets!.kcal * 0.7)
    d.foodEntries = [1, 2, 3, 4].map((i) => food(shiftDate(d.today, -i), kcal, 60))
    const out = ruleNutrition(d)
    expect(out.map((i) => i.id)).toEqual(['nutrition_kcal:under', 'nutrition_protein'])
    expect(out[0].title).toBe('Калорий на 30 % меньше нормы')
    expect(out[1].body).toContain('Творог (17 г на 100 г)')
  })

  it('on target → nothing', () => {
    const d = coachData()
    d.foodEntries = [1, 2, 3].map((i) => food(shiftDate(d.today, -i), d.targets!.kcal, d.targets!.proteinG))
    expect(ruleNutrition(d)).toEqual([])
  })
})

describe('rule 4 — weight plateau', () => {
  const series = (f: (i: number) => number) =>
    Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, date: shiftDate('2026-10-07', -i), weightKg: f(i) })).reverse()

  it('flat 14-day trend on a cut → −100 kcal', () => {
    const [ins] = ruleWeightPlateau(coachData({ weights: series(() => 85) }))
    expect(ins.body).toMatch(/^−100 ккал/)
    expect(ruleWeightPlateau(coachData({ profile: profile({ goal: 'lean_bulk', targetWeightKg: 90 }), weights: series(() => 85) }))[0].body).toMatch(/^\+100/)
  })

  it('losing ~0.7 kg/week or < 10 weigh-ins → nothing', () => {
    expect(ruleWeightPlateau(coachData({ weights: series((i) => 85 + i * 0.1) }))).toEqual([])
    expect(ruleWeightPlateau(coachData({ weights: series(() => 85).slice(0, 9) }))).toEqual([])
  })
})

describe('rule 5 — cardio on a cut', () => {
  it('suggests a rest day that is not before a leg day', () => {
    const [ins] = ruleCardio(coachData({ activities: [{ id: 'a', type: 'run', date: '2026-10-06', durationMin: 20 }] }))
    expect(ins.body).toContain('завтра') // Thu: free, Fri is pull
    expect(ins.action?.to).toBe('/cardio/new?type=walk')
    expect(ins.evidence).toContain('Дни ног: Пн')
  })
  it('two sessions or a non-cut goal → nothing', () => {
    const two = [1, 2].map((i) => ({ id: `a${i}`, type: 'swim' as const, date: shiftDate('2026-10-07', -i), durationMin: 30 }))
    expect(ruleCardio(coachData({ activities: two }))).toEqual([])
    expect(ruleCardio(coachData({ profile: profile({ goal: 'maintain' }) }))).toEqual([])
  })
})

describe('rule 6 — deload', () => {
  const weeks = (perWeek: number, mondays: string[]) =>
    newest(
      ...mondays.flatMap((mon, w) =>
        Array.from({ length: perWeek }, (_, k) =>
          session(`s${w}-${k}`, shiftDate(mon, k), [{ exerciseId: 'Barbell_Squat', sets: [set(100 + w * 5, 5)] }]),
        ),
      ),
    )
  it('four weeks with ≥ 4 sessions and growing volume → deload', () => {
    const d = coachData({ targetPerWeek: 4, sessions: weeks(4, ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']) })
    expect(ruleDeload(d)[0].title).toBe('Эта неделя — разгрузочная')
    expect(ruleDeload(coachData({ targetPerWeek: 4, sessions: weeks(3, ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']) }))).toEqual([])
  })
})

describe('rule 7 — weekly frequency', () => {
  const s = (id: string, date: string, dayId = 'push') =>
    session(id, date, [{ exerciseId: 'X', sets: [set(10, 10)] }], { programId: 'p1', programDayId: dayId })

  it('plenty of days left → gentle nudge (priority 3)', () => {
    const [ins] = ruleFrequency(coachData({ sessions: [s('a', '2026-10-05', 'legs')] }))
    expect(ins).toMatchObject({ priority: 3, title: '1 из 3 на этой неделе' })
    expect(ins.action?.to).toBe('/workouts/start/p1/push')
  })

  it('days left ≤ sessions missing → insist (priority 1) with the next program day', () => {
    const d = coachData({ now: localDate('2026-10-10', 9), sessions: [s('a', '2026-10-06', 'push')] })
    const [ins] = ruleFrequency(d)
    expect(ins.priority).toBe(1)
    expect(ins.body).toBe('До конца недели 2 дня, тренировок 1 из 3 — сегодня лучший день для «Тяга».')
  })

  it('target reached → positive insight with a week streak', () => {
    const sessions = newest(
      ...['2026-09-29', '2026-10-01', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07'].map((d, i) => s(`s${i}`, d)),
    )
    const [ins] = ruleFrequency(coachData({ now: localDate('2026-10-07', 20), sessions }))
    expect(ins).toMatchObject({ kind: 'motivation', title: '3 из 3 — неделя закрыта' })
    expect(ins.evidence).toContain('Недель подряд с ≥ 3: 2')
  })
})

describe('rule 8 — habit streak at risk', () => {
  const habit: Habit = { id: 'h', name: 'Чтение', icon: '📖', color: 'amber', frequency: 'daily', autoRule: null, sort: 0, archived: false, createdAt: at('2026-01-01') }
  it('after 18:00 with nothing done today but everything yesterday', () => {
    const done = new Map([['h', new Set(['2026-10-05', '2026-10-06'])]])
    const [ins] = ruleHabitsStreak(coachData({ now: localDate('2026-10-07', 19), habits: [habit], habitDone: done }))
    expect(ins).toMatchObject({ priority: 1, kind: 'habits' })
    expect(ins.body).toContain('2 дня подряд')
    expect(ruleHabitsStreak(coachData({ now: localDate('2026-10-07', 17), habits: [habit], habitDone: done }))).toEqual([])
  })
})

describe('rule 9 — water', () => {
  it('< 60 % of the target at 16:00 → drink 500 ml', () => {
    const water = [{ id: 'w', date: '2026-10-07', ml: 1000, createdAt: at('2026-10-07', 9) }]
    expect(ruleWater(coachData({ now: localDate('2026-10-07', 16), water }))[0].title).toBe('Выпей 500 мл воды')
    expect(ruleWater(coachData({ now: localDate('2026-10-07', 15), water }))).toEqual([])
    expect(ruleWater(coachData({ now: localDate('2026-10-07', 16), water: [{ ...water[0], ml: 2000 }] }))).toEqual([])
  })
})

describe('rule 10 — records and motivation', () => {
  it('new PR this week, best volume week and an active-day streak', () => {
    const sessions = newest(
      session('a', '2026-09-14', [{ exerciseId: 'Barbell_Squat', name: 'Присед', sets: [set(100, 5)] }]),
      session('b', '2026-09-21', [{ exerciseId: 'Barbell_Squat', name: 'Присед', sets: [set(100, 5)] }]),
      session('c', '2026-09-28', [{ exerciseId: 'Barbell_Squat', name: 'Присед', sets: [set(100, 5)] }]),
      session('d', '2026-10-05', [{ exerciseId: 'Barbell_Squat', name: 'Присед', sets: [set(110, 5)] }]),
      session('e', '2026-10-06', [{ exerciseId: 'Bench', name: 'Жим', sets: [set(50, 5)] }]),
    )
    const activities = [{ id: 'x', type: 'walk' as const, date: '2026-10-04', durationMin: 30 }, { id: 'y', type: 'walk' as const, date: '2026-10-07', durationMin: 30 }]
    const ids = ruleRecords(coachData({ sessions, activities })).map((i) => i.id)
    expect(ids).toEqual(['records_pr', 'records_week:2026-10-05', 'records_streak'])
    expect(ruleRecords(coachData({ sessions, activities }))[0].title).toBe('Новый рекорд: Присед')
  })
})

describe('rule 11 — stress', () => {
  it('average stress ≥ 4 over 3 days → light session or breathing', () => {
    const moods = [4, 5].map((stress, i) => ({ id: `m${i}`, date: shiftDate('2026-10-07', -i), slot: 'morning' as const, mood: 2 as const, stress: stress as 4 | 5, createdAt: at('2026-10-07') }))
    const [ins] = ruleStress(coachData({ moods }))
    expect(ins).toMatchObject({ priority: 1, kind: 'recovery' })
    expect(ins.action?.to).toBe('/mind/breathe')
    expect(ruleStress(coachData({ moods: moods.map((m) => ({ ...m, stress: 3 as const })) }))).toEqual([])
  })
})

describe('engine', () => {
  const mk = (id: string, rule: Insight['rule'], priority: 1 | 2 | 3, kind: Insight['kind'] = 'training'): Insight => ({
    id, rule, priority, kind, title: id, body: '', evidence: [id],
  })

  it('rankInsights sorts by priority, merges a group and drops dismissed', () => {
    const out = rankInsights(
      [mk('rec', 'records', 3, 'motivation'), mk('stress', 'stress', 2, 'recovery'), mk('sleep', 'sleep_volume', 1, 'recovery'), mk('w', 'water', 2, 'nutrition')],
      { dismissed: ['w'] },
    )
    expect(out.map((i) => i.id)).toEqual(['sleep', 'rec'])
    expect(out[0].evidence).toEqual(['sleep', 'stress'])
  })

  it('pickBrief returns at most 3, one per kind first', () => {
    const list = [mk('a', 'frequency', 1), mk('b', 'deload', 1), mk('c', 'water', 2, 'nutrition'), mk('d', 'records', 3, 'motivation')]
    expect(pickBrief(list).map((i) => i.id)).toEqual(['a', 'c', 'd'])
  })

  describe('generateInsights on a database', () => {
    let db: FormaDB
    const NOW = localDate('2026-10-07', 17)
    beforeEach(async () => {
      db = freshDb()
      await db.profile.put(profile())
      await db.programs.put(program())
      await db.water.put({ id: 'w', date: '2026-10-07', ml: 500, createdAt: at('2026-10-07', 9) })
      await db.sleep.put({ id: 's', date: '2026-10-07', bedtime: at('2026-10-07', 1), wakeTime: at('2026-10-07', 6), durationMin: 300, quality: 2 })
      await db.moods.bulkPut([4, 5].map((st, i) => ({ id: `m${i}`, date: shiftDate('2026-10-07', -i), slot: 'morning' as const, mood: 2 as const, stress: st as 4 | 5, createdAt: at('2026-10-07') })))
    })
    afterEach(async () => {
      db.close()
      await db.delete()
    })

    it('dedupes, honours rule toggles and dismissals', async () => {
      const all = await generateInsights(db, NOW)
      expect(all.filter((i) => i.kind === 'recovery')).toHaveLength(1)
      expect(all[0].rule).toBe('sleep_volume')
      expect(all[0].evidence.some((e) => e.startsWith('Средний стресс'))).toBe(true)
      expect(all.map((i) => i.rule)).toContain('water')

      await dismissInsight(db, 'water', NOW)
      expect((await generateInsights(db, NOW)).map((i) => i.rule)).not.toContain('water')
      expect((await generateInsights(db, NOW, { includeDismissed: true })).map((i) => i.rule)).toContain('water')
      expect((await generateInsights(db, localDate('2026-10-08', 17))).map((i) => i.rule)).toContain('water')

      await setRuleEnabled(db, 'sleep_volume', false)
      const next = await generateInsights(db, NOW)
      expect(next.find((i) => i.kind === 'recovery')?.rule).toBe('stress')
    })

    it('reads the weekly target from settings', async () => {
      await db.settings.put({ key: 'training.targetPerWeek', value: 2 })
      const freq = (await generateInsights(db, NOW)).find((i) => i.rule === 'frequency')
      expect(freq?.title).toBe('0 из 2 на этой неделе')
    })
  })
})
