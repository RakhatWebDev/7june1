import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { useState } from 'react'
import {
  Button,
  Card,
  CountUp,
  EmptyState,
  Progress,
  Ring,
  SegmentedControl,
  SegmentedNav,
  Sheet,
  StaggerList,
  Stepper,
  Toast,
} from '.'

describe('ui primitives (reduced motion in tests)', () => {
  it('Button shows a spinner and is disabled while loading', () => {
    render(
      <Button loading icon="plus">
        Сохранить
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Сохранить' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })

  it('Card accepts variant/tone and passes through attributes', () => {
    render(
      <Card variant="accent" tone="info" data-testid="c">
        x
      </Card>,
    )
    expect(screen.getByTestId('c').tagName).toBe('SECTION')
  })

  it('Progress clamps and exposes progressbar semantics', () => {
    render(<Progress value={1.7} aria-label="Белок" />)
    expect(screen.getByRole('progressbar', { name: 'Белок' })).toHaveAttribute('aria-valuenow', '100')
  })

  it('Ring and CountUp render final values without animation', () => {
    render(
      <Ring value={0.5} aria-label="Вода: 500 из 1000">
        <CountUp value={1500} />
      </Ring>,
    )
    expect(screen.getByRole('img', { name: 'Вода: 500 из 1000' })).toBeInTheDocument()
    expect(screen.getByText('1 500')).toBeInTheDocument()
  })

  it('Stepper keeps its input next to the ± buttons', () => {
    const onChange = vi.fn()
    render(<Stepper value={10} step={2.5} onChange={onChange} aria-label="Вес" />)
    fireEvent.click(screen.getByRole('button', { name: 'Больше' }))
    expect(onChange).toHaveBeenCalledWith(12.5)
    expect(screen.getByLabelText('Вес')).toHaveValue(10)
  })

  it('SegmentedControl switches the checked option', () => {
    function Demo() {
      const [v, setV] = useState<'a' | 'b'>('a')
      return (
        <SegmentedControl
          aria-label="Период"
          value={v}
          onChange={setV}
          options={[
            { value: 'a', label: 'Неделя' },
            { value: 'b', label: 'Месяц' },
          ]}
        />
      )
    }
    render(<Demo />)
    fireEvent.click(screen.getByRole('radio', { name: 'Месяц' }))
    expect(screen.getByRole('radio', { name: 'Месяц' })).toHaveAttribute('aria-checked', 'true')
  })

  it('SegmentedNav marks the current path', () => {
    render(
      <MemoryRouter initialEntries={['/cardio']}>
        <SegmentedNav
          aria-label="Разделы"
          items={[
            { to: '/workouts', label: 'Зал' },
            { to: '/cardio', label: 'Кардио' },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Кардио' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Зал' })).not.toHaveAttribute('aria-current')
  })

  it('Sheet renders in a portal and closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Вес сегодня">
        <p>body</p>
      </Sheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Вес сегодня' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('StaggerList wraps children (li for lists) and skips nulls', () => {
    render(
      <StaggerList as="ul">
        <span>a</span>
        {null}
        <span>b</span>
      </StaggerList>,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('EmptyState and Toast render their content', () => {
    render(
      <>
        <EmptyState icon="dumbbell" title="Пусто" hint="Добавьте" />
        <Toast open>Новый рекорд</Toast>
      </>,
    )
    expect(screen.getByText('Пусто')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Новый рекорд')
  })
})
