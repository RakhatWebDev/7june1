import { describe, expect, it } from 'vitest'
import { buildCoachPrompt, historyToTurns } from './coachPrompt'
import { describeMutation } from './toolLabels'
import { fitWithin } from './image'
import { claudeCostRange } from './costs'

describe('coach prompt', () => {
  it('is Russian, asks to use tools first, has a medical disclaimer and embeds the context', () => {
    const p = buildCoachPrompt({ profile: { name: 'Рахат', goal: 'cut' } }, new Date(2026, 9, 8, 9))
    expect(p).toContain('Сначала смотри данные через инструменты')
    expect(p).toContain('Ты не врач')
    expect(p).toContain('Сегодня: 2026-10-08 (четверг)')
    expect(p).toContain('"name":"Рахат"')
  })

  it('turns stored chat into text-only turns, newest last', () => {
    const at = (i: number) => new Date(2026, 0, 1, 0, i).toISOString()
    const turns = historyToTurns(
      [
        { id: '1', threadId: 'coach', role: 'user', text: 'a', createdAt: at(1) },
        { id: '2', threadId: 'coach', role: 'tool', text: 'x', createdAt: at(2) },
        { id: '3', threadId: 'coach', role: 'assistant', text: 'b', createdAt: at(3) },
        { id: '4', threadId: 'coach', role: 'user', text: 'c', createdAt: at(4) },
      ],
      2,
    )
    expect(turns).toEqual([
      { role: 'assistant', parts: [{ type: 'text', text: 'b' }] },
      { role: 'user', parts: [{ type: 'text', text: 'c' }] },
    ])
  })
})

describe('helpers', () => {
  it('describes pending writes in Russian', () => {
    expect(
      describeMutation('log_food_entry', { name: 'Плов', grams: 250, kcal: 420.4, proteinG: 18, fatG: 15, carbsG: 55, meal: 'lunch' }),
    ).toBe('Плов, 250 г, 420 ккал, Б 18 · Ж 15 · У 55 (обед)')
    expect(describeMutation('log_activity', { type: 'swim', durationMin: 30, distanceKm: 1.2 })).toBe('Плавание, 30 мин, 1,2 км')
    expect(describeMutation('save_program', { program: { name: 'Сплит', days: [{}, {}, {}, {}] } })).toBe('Программа «Сплит», 4 дн.')
  })

  it('fits photos into 1024 px without upscaling', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1024, height: 768 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 768, height: 1024 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('estimates Claude cost per question within a sane range', () => {
    const [lo, hi] = claudeCostRange(1)
    expect(lo).toBeGreaterThan(0.01)
    expect(hi).toBeLessThan(0.5)
  })
})
