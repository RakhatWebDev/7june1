import { describe, expect, it } from 'vitest'
import { FormaDB } from './index'
import { ensureSeeded } from './seed'
import { builtInPrograms } from '../data/programs'

describe('ensureSeeded', () => {
  it('creates the default profile and built-in programs idempotently', async () => {
    const db = new FormaDB('forma-test-seed')
    await ensureSeeded(db)
    await ensureSeeded(db)
    const profile = await db.profile.get(1)
    expect(profile?.heightCm).toBe(183)
    expect(profile?.weightKg).toBe(88)
    expect(await db.programs.count()).toBe(builtInPrograms.length)
    const dup = await db.programs.get('david-laid-dup')
    expect(dup?.days).toHaveLength(6)
    expect(dup?.schedule).toBe('sequential')
    // David Laid — Program 1 is the default program; the user's tested maxes are seeded
    expect((await db.settings.get('activeProgramId'))?.value).toBe('david-laid-program-1')
    expect((await db.settings.get('lifts.maxes'))?.value).toEqual({
      Barbell_Squat: 60,
      'Barbell_Bench_Press_-_Medium_Grip': 60,
      Barbell_Deadlift: 70,
    })
  })

  it('resets the cycle state of a built-in program whose version changed, keeps it otherwise', async () => {
    const db = new FormaDB('forma-test-seed-version')
    await ensureSeeded(db)
    const keep = { startDate: '2026-10-01', completedSessions: 5, nextDayIndex: 5 }
    await db.settings.put({ key: 'program.cycle:david-laid-program-1', value: keep })
    await ensureSeeded(db)
    expect((await db.settings.get('program.cycle:david-laid-program-1'))?.value).toEqual(keep)
    // an old (pre-12-week) copy of the program with a week override
    const p1 = (await db.programs.get('david-laid-program-1'))!
    await db.programs.put({ ...p1, version: undefined, weeks: 4 })
    await db.settings.put({
      key: 'program.cycle:david-laid-program-1',
      value: { startDate: '2026-09-01', week: 3, nextDayIndex: 2 },
    })
    await ensureSeeded(db)
    expect(await db.settings.get('program.cycle:david-laid-program-1')).toBeUndefined()
    expect((await db.programs.get('david-laid-program-1'))?.weeks).toBe(12)
  })
})
