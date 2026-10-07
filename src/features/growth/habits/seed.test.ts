import { describe, expect, it } from 'vitest'
import { FormaDB } from '../../../db'
import { DEFAULT_HABITS, ensureHabitsSeeded } from './seed'

describe('ensureHabitsSeeded', () => {
  it('creates the 8 default habits with stable ids, once', async () => {
    const d = new FormaDB('test-habits-seed')
    await ensureHabitsSeeded(d)
    await ensureHabitsSeeded(d)
    const all = await d.habits.orderBy('sort').toArray()
    expect(all).toHaveLength(8)
    expect(all.map((h) => h.id).every((id) => id.startsWith('habit-'))).toBe(true)
    expect(all.find((h) => h.id === 'habit-cardio')).toMatchObject({ frequency: 'weekly', targetPerWeek: 3, autoRule: 'cardio' })
    expect(all.find((h) => h.id === 'habit-steps')).toMatchObject({ autoRule: null, archived: false })

    // a habit the user deleted is not recreated, and edits are kept
    await d.habits.delete('habit-steps')
    await d.habits.update('habit-workout', { name: 'Зал' })
    await ensureHabitsSeeded(d)
    expect(await d.habits.count()).toBe(DEFAULT_HABITS.length - 1)
    expect((await d.habits.get('habit-workout'))?.name).toBe('Зал')
    d.close()
  })

  it('is safe under concurrent calls', async () => {
    const d = new FormaDB('test-habits-seed-concurrent')
    await Promise.all([ensureHabitsSeeded(d), ensureHabitsSeeded(d)])
    expect(await d.habits.count()).toBe(8)
    d.close()
  })
})
