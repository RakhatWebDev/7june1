import { describe, expect, it } from 'vitest'
import { weekNarrative } from './narrative'

const base = {
  workouts: 0, workoutVolumeKg: 0, cardioMin: 0, cardioKm: 0, avgSleepMin: 0, sleepNights: 0, avgKcal: 0, kcalTarget: 0,
  daysOnKcal: 0, habitsPct: 0, moodAvg: 0, weightStart: 0, weightEnd: 0,
}

describe('weekNarrative', () => {
  it('compares the week with the previous one in 3–5 sentences', () => {
    const s = weekNarrative({
      goal: 'cut',
      stats: { ...base, workouts: 3, workoutVolumeKg: 11000, weightStart: 85.2, weightEnd: 84.6, avgKcal: 2150, kcalTarget: 2300, daysOnKcal: 4, avgSleepMin: 410, sleepNights: 6, cardioMin: 60, cardioKm: 4.5 },
      previous: { ...base, workouts: 2, workoutVolumeKg: 10000, cardioMin: 30, avgSleepMin: 380 },
    })
    expect(s.length).toBeGreaterThanOrEqual(3)
    expect(s.length).toBeLessThanOrEqual(5)
    expect(s[0]).toMatch(/^3 тренировки и 11\s000 кг объёма — на 10 % больше, чем неделей раньше\. План 3 из 3 выполнен\.$/)
    expect(s[1]).toBe('Вес: 85,2 → 84,6 кг (−0,6) — в сторону цели.')
    expect(s[2]).toContain('в коридоре')
    expect(s[3]).toBe('Сон в среднем 6 ч 50 мин — на 1 ч 10 мин меньше цели, лучше прошлой недели.')
  })

  it('falls back to a single hint for an empty week', () => {
    const s = weekNarrative({ stats: base, previous: base })
    expect(s).toHaveLength(1)
    expect(s[0]).toContain('Данных пока немного')
    const cut = weekNarrative({ stats: base, previous: { ...base, workouts: 2 }, goal: 'cut' })
    expect(cut[0]).toContain('Силовых на этой неделе не было')
    expect(cut[1]).toContain('Кардио пока нет')
  })
})
