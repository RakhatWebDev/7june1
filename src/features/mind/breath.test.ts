import { describe, expect, it } from 'vitest'
import { BREATH_PATTERNS, buildSequence, cycleMs, getPattern, phaseAt, sequenceMs, WIM_HOF_BREATHS, type BreathStep } from './breath'

function kindsOver(steps: BreathStep[], untilMs: number, stepMs = 500): string[] {
  const out: string[] = []
  for (let t = 0; t < untilMs; t += stepMs) {
    const p = phaseAt(steps, t)
    const label = `${p.step.phase.kind}#${p.step.cycle}`
    if (out[out.length - 1] !== label) out.push(label)
  }
  return out
}

describe('breathing phase machine', () => {
  it('box 4-4-4-4 goes inhale → hold → exhale → hold out, then repeats', () => {
    const steps = buildSequence(getPattern('box-4-4-4-4')!, 2)
    expect(sequenceMs(steps)).toBe(32_000)
    expect(kindsOver(steps, 32_000)).toEqual([
      'inhale#0',
      'hold#0',
      'exhale#0',
      'holdOut#0',
      'inhale#1',
      'hold#1',
      'exhale#1',
      'holdOut#1',
    ])
  })

  it('4-7-8 switches phases exactly at 4 s and 11 s', () => {
    const steps = buildSequence(getPattern('4-7-8')!, 1)
    expect(phaseAt(steps, 0).step.phase.kind).toBe('inhale')
    expect(phaseAt(steps, 3_999).step.phase.kind).toBe('inhale')
    expect(phaseAt(steps, 3_999).remainingMs).toBe(1)
    expect(phaseAt(steps, 4_000).step.phase.kind).toBe('hold')
    expect(phaseAt(steps, 10_999).step.phase.kind).toBe('hold')
    expect(phaseAt(steps, 11_000)).toMatchObject({ remainingMs: 8_000, done: false })
    expect(phaseAt(steps, 11_000).step.phase.kind).toBe('exhale')
    expect(phaseAt(steps, 19_000)).toMatchObject({ done: true, remainingMs: 0 })
  })

  it('coherent 5-5 alternates inhale and exhale', () => {
    const steps = buildSequence(getPattern('coherent-5-5')!, 3)
    expect(steps.map((s) => s.phase.kind)).toEqual(['inhale', 'exhale', 'inhale', 'exhale', 'inhale', 'exhale'])
    expect(phaseAt(steps, 25_000).step).toMatchObject({ cycle: 2 })
  })

  it('Wim Hof-lite: 30 breaths, then breath hold, recovery inhale and hold', () => {
    const pattern = getPattern('wim-hof-lite')!
    const steps = buildSequence(pattern, 1)
    const kinds = steps.map((s) => s.phase.kind)
    expect(kinds.slice(0, WIM_HOF_BREATHS * 2)).toEqual(Array.from({ length: WIM_HOF_BREATHS }, () => ['inhale', 'exhale']).flat())
    expect(kinds.slice(WIM_HOF_BREATHS * 2)).toEqual(['holdOut', 'inhale', 'hold', 'exhale'])
    expect(phaseAt(steps, 0).step.phase.note).toBe('Вдох 1 из 30')
    expect(phaseAt(steps, 117_000).step.phase.note).toBe('Вдох 30 из 30')
    // 30 × 4 s of breathing → the retention starts at 120 s
    expect(phaseAt(steps, 120_000).step.phase).toMatchObject({ kind: 'holdOut', sec: 60 })
    expect(cycleMs(pattern)).toBe(120_000 + 60_000 + 3_000 + 15_000 + 3_000)
  })

  it('every pattern has a positive cycle and valid defaults', () => {
    for (const p of BREATH_PATTERNS) {
      expect(cycleMs(p)).toBeGreaterThan(0)
      expect(p.defaultCycles).toBeGreaterThanOrEqual(1)
      expect(p.defaultCycles).toBeLessThanOrEqual(p.maxCycles)
    }
    expect(getPattern('nope')).toBeUndefined()
  })
})
