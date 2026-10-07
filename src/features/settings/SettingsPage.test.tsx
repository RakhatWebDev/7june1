import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { db } from '../../db'
import { ensureSeeded } from '../../db/seed'
import { exportData } from './backup'
import { SettingsPage } from './SettingsPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
}

describe('SettingsPage', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await ensureSeeded(db)
  })

  it('edits and saves the profile', async () => {
    const user = userEvent.setup()
    renderPage()
    const height = await screen.findByLabelText('Рост, см')
    expect(height).toHaveValue(183)
    await user.clear(height)
    await user.type(height, '180')
    await user.selectOptions(screen.getByLabelText('Цель'), 'maintain')
    await user.clear(screen.getByLabelText('Сон, ч/ночь'))
    await user.type(screen.getByLabelText('Сон, ч/ночь'), '7.5')
    await user.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Сохранено')
    const p = await db.profile.get(1)
    expect(p).toMatchObject({ heightCm: 180, goal: 'maintain', sleepTargetMin: 450 })
  })

  it('shows validation errors and does not save', async () => {
    const user = userEvent.setup()
    renderPage()
    const height = await screen.findByLabelText('Рост, см')
    await user.clear(height)
    await user.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(await screen.findByText('Обязательное поле')).toBeInTheDocument()
    expect((await db.profile.get(1))?.heightCm).toBe(183)
  })

  it('imports a backup file after confirmation', async () => {
    await db.weights.put({ id: 'w1', date: '2026-10-01', weightKg: 85 })
    const backup = await exportData(db)
    await db.weights.clear()
    await db.weights.put({ id: 'other', date: '2026-10-02', weightKg: 99 })

    const user = userEvent.setup()
    renderPage()
    const file = new File([JSON.stringify(backup)], 'forma-backup-2026-10-07.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Файл резервной копии'), file)
    expect(await screen.findByRole('dialog', { name: 'Заменить все данные?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Заменить всё' }))
    expect(await screen.findByText('Данные восстановлены из копии.')).toBeInTheDocument()
    expect((await db.weights.toArray()).map((w) => w.id)).toEqual(['w1'])
  })

  it('rejects an invalid backup file', async () => {
    const user = userEvent.setup()
    renderPage()
    const file = new File(['{"version":1,"tables":{}}'], 'bad.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Файл резервной копии'), file)
    expect(await screen.findByText(/Не хватает таблиц/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resets data after confirmation', async () => {
    await db.weights.put({ id: 'w1', date: '2026-10-01', weightKg: 85 })
    await db.profile.update(1, { name: 'Другое' })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Сбросить данные' }))
    await user.click(screen.getByRole('button', { name: 'Да, удалить всё' }))
    expect(await screen.findByText('Данные сброшены.')).toBeInTheDocument()
    expect(await db.weights.count()).toBe(0)
    await waitFor(() => expect(screen.getByLabelText('Имя')).toHaveValue('Рахат'))
  })
})
