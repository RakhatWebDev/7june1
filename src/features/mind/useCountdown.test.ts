import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCountdown } from './useCountdown'

/** A Screen Wake Lock stub that counts acquired and released sentinels. */
function stubWakeLock() {
  const counts = { requested: 0, released: 0 }
  vi.stubGlobal('navigator', {
    ...navigator,
    wakeLock: {
      request: () => {
        counts.requested++
        return Promise.resolve({
          release: () => {
            counts.released++
            return Promise.resolve()
          },
          addEventListener: () => {},
        })
      },
    },
  })
  return counts
}

afterEach(() => vi.unstubAllGlobals())

describe('useCountdown wake lock', () => {
  it('keeps the screen awake while running and releases it on pause', async () => {
    const counts = stubWakeLock()
    const { result } = renderHook(() => useCountdown(60_000))
    expect(counts.requested).toBe(0)
    act(() => result.current.start())
    await waitFor(() => expect(counts.requested).toBe(1))
    act(() => result.current.pause())
    await waitFor(() => expect(counts.released).toBe(1))
  })

  it('releases the lock on unmount', async () => {
    const counts = stubWakeLock()
    const { result, unmount } = renderHook(() => useCountdown(60_000))
    act(() => result.current.start())
    await waitFor(() => expect(counts.requested).toBe(1))
    unmount()
    await waitFor(() => expect(counts.released).toBe(1))
  })
})
