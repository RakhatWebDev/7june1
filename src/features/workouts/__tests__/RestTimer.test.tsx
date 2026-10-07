import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { RestTimer } from '../RestTimer'

describe('RestTimer', () => {
  const vibrate = vi.fn()
  beforeEach(() => {
    vi.useFakeTimers()
    vibrate.mockReset()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true })
  })
  afterEach(() => vi.useRealTimers())

  const remaining = () => screen.getByTestId('rest-remaining').textContent

  it('counts down, adds 30 s, and vibrates once at zero', () => {
    const onClose = vi.fn()
    render(<RestTimer durationSec={90} onClose={onClose} />)
    expect(remaining()).toBe('1:30')
    act(() => vi.advanceTimersByTime(30_000))
    expect(remaining()).toBe('1:00')
    fireEvent.click(screen.getByRole('button', { name: '+30 с' }))
    expect(remaining()).toBe('1:30')
    act(() => vi.advanceTimersByTime(89_000))
    expect(remaining()).toBe('0:01')
    expect(vibrate).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1_000))
    expect(remaining()).toBe('0:00')
    expect(screen.getByText(/Отдых окончен/)).toBeInTheDocument()
    expect(vibrate).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(5_000))
    expect(vibrate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('can be skipped', () => {
    const onClose = vi.fn()
    render(<RestTimer durationSec={60} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Пропустить' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
