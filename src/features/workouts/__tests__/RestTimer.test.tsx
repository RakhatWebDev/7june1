import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { BigRestTimer } from '../BigRestTimer'
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

describe('BigRestTimer', () => {
  const vibrate = vi.fn()
  beforeEach(() => {
    vi.useFakeTimers()
    vibrate.mockReset()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true })
  })
  afterEach(() => vi.useRealTimers())

  const remaining = () => screen.getByTestId('big-rest-remaining').textContent

  it('counts down with +30 s, fires onElapsed once at zero and continues via the done button', () => {
    const onDone = vi.fn()
    const onElapsed = vi.fn()
    render(
      <BigRestTimer
        durationSec={60}
        label="следующий: подход 2 из 3"
        onDone={onDone}
        onElapsed={onElapsed}
      />,
    )
    expect(screen.getByRole('timer')).toHaveTextContent('Отдых · следующий: подход 2 из 3')
    expect(remaining()).toBe('1:00')
    act(() => vi.advanceTimersByTime(20_000))
    expect(remaining()).toBe('0:40')
    fireEvent.click(screen.getByRole('button', { name: '+30 с' }))
    expect(remaining()).toBe('1:10')
    act(() => vi.advanceTimersByTime(70_000))
    expect(remaining()).toBe('0:00')
    expect(screen.getByText(/Отдых окончен/)).toBeInTheDocument()
    expect(onElapsed).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(5_000))
    expect(onElapsed).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Следующий подход' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('skip calls through; presets report the chosen duration', () => {
    const onDone = vi.fn()
    const onPreset = vi.fn()
    render(<BigRestTimer durationSec={90} label="x" onDone={onDone} onPreset={onPreset} />)
    expect(screen.getByRole('button', { name: '1:30' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '3:00' }))
    expect(onPreset).toHaveBeenCalledWith(180)
    fireEvent.click(screen.getByRole('button', { name: 'Пропустить' }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(vibrate).not.toHaveBeenCalled()
  })
})
