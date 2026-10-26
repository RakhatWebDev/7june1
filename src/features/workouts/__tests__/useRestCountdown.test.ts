import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRestCountdown } from '../useRestCountdown'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'))
})
afterEach(() => vi.useRealTimers())

describe('useRestCountdown', () => {
  it('exposes the end time and moves it with +30 s', () => {
    const start = Date.now()
    const { result } = renderHook(() => useRestCountdown(90))
    expect(result.current.endsAt).toBe(start + 90_000)
    act(() => result.current.addTime())
    expect(result.current.endsAt).toBe(start + 120_000)
    expect(result.current.remaining).toBe(120)
  })

  it('resumes from a stored end time instead of the full duration', () => {
    const endsAt = Date.now() + 40_000
    const { result } = renderHook(() => useRestCountdown(120, { initialEndsAt: endsAt }))
    expect(result.current.remaining).toBe(40)
    expect(result.current.endsAt).toBe(endsAt)
    act(() => vi.advanceTimersByTime(40_000))
    expect(result.current.finished).toBe(true)
  })

  it('a stored end time in the past is already finished', () => {
    const { result } = renderHook(() =>
      useRestCountdown(120, { initialEndsAt: Date.now() - 5_000 }),
    )
    expect(result.current.finished).toBe(true)
  })
})
