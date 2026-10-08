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
    expect(dup?.days).toHaveLength(7)
    expect(dup?.days.filter((d) => d.type !== 'rest')).toHaveLength(6)
    // David Laid — Program 1 is the default program; the user's tested maxes are seeded
    expect((await db.settings.get('activeProgramId'))?.value).toBe('david-laid-program-1')
    expect((await db.settings.get('lifts.maxes'))?.value).toEqual({
      Barbell_Squat: 60,
      'Barbell_Bench_Press_-_Medium_Grip': 60,
      Barbell_Deadlift: 70,
    })
  })
})
