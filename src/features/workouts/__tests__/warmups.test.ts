import { describe, expect, it } from 'vitest'
import { warmupSets } from '../warmups'

const sets = (pairs: [number, number][]) =>
  pairs.map(([weightKg, reps]) => ({ weightKg, reps, done: false, warmup: true }))

describe('warmupSets', () => {
  it('ramps 40 % × 8, 60 % × 5, 80 % × 3 of the working weight', () => {
    expect(warmupSets(100)).toEqual(
      sets([
        [40, 8],
        [60, 5],
        [80, 3],
      ]),
    )
  })

  it('rounds to the 2.5 kg plate step', () => {
    expect(warmupSets(82.5)).toEqual(
      sets([
        [32.5, 8],
        [50, 5],
        [65, 3],
      ]),
    )
  })

  it('never goes below the empty 20 kg bar and drops repeats', () => {
    expect(warmupSets(40)).toEqual(
      sets([
        [20, 8],
        [25, 5],
        [32.5, 3],
      ]),
    )
    expect(warmupSets(30)).toEqual(
      sets([
        [20, 8],
        [25, 3],
      ]),
    )
  })

  it('no warm-up when the working weight is the empty bar or unknown', () => {
    expect(warmupSets(20)).toEqual([])
    expect(warmupSets(0)).toEqual([])
  })
})
