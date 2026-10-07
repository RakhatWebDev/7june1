import { describe, expect, it } from 'vitest'
import { completed, formatClock, initTimer, isRunning, remainingMs, sessionMinutes, shouldSave, timerReducer } from './timer'

describe('timerReducer', () => {
  it('counts down from wall-clock time and finishes at zero', () => {
    let s = initTimer(60_000)
    s = timerReducer(s, { type: 'start', now: 1_000 })
    expect(isRunning(s)).toBe(true)
    s = timerReducer(s, { type: 'tick', now: 31_000 })
    expect(remainingMs(s)).toBe(30_000)
    s = timerReducer(s, { type: 'tick', now: 70_000 })
    expect(s).toMatchObject({ elapsedMs: 60_000, done: true, lastTick: null })
    expect(completed(s)).toBe(true)
    // Ignored once done
    expect(timerReducer(s, { type: 'start', now: 80_000 })).toBe(s)
  })

  it('does not count paused time', () => {
    let s = timerReducer(initTimer(60_000), { type: 'start', now: 0 })
    s = timerReducer(s, { type: 'pause', now: 10_000 })
    expect(isRunning(s)).toBe(false)
    s = timerReducer(s, { type: 'tick', now: 50_000 })
    expect(s.elapsedMs).toBe(10_000)
    s = timerReducer(s, { type: 'start', now: 100_000 })
    s = timerReducer(s, { type: 'tick', now: 105_000 })
    expect(s.elapsedMs).toBe(15_000)
  })

  it('finishing early keeps the actual time and is not "completed"', () => {
    let s = timerReducer(initTimer(600_000), { type: 'start', now: 0 })
    s = timerReducer(s, { type: 'finish', now: 185_000 })
    expect(s).toMatchObject({ done: true, elapsedMs: 185_000 })
    expect(completed(s)).toBe(false)
    expect(sessionMinutes(s.elapsedMs)).toBe(3)
  })

  it('reset starts over with a new duration', () => {
    const s = timerReducer(timerReducer(initTimer(1_000), { type: 'finish', now: 0 }), { type: 'reset', totalMs: 5_000 })
    expect(s).toEqual(initTimer(5_000))
  })
})

describe('timer helpers', () => {
  it('formats clocks', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(75)).toBe('1:15')
    expect(formatClock(599.2)).toBe('10:00')
    expect(formatClock(3725)).toBe('1:02:05')
  })

  it('rounds minutes and ignores accidental taps', () => {
    expect(sessionMinutes(10_000)).toBe(1)
    expect(sessionMinutes(150_000)).toBe(3)
    expect(shouldSave(14_999)).toBe(false)
    expect(shouldSave(15_000)).toBe(true)
  })
})
