import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { db } from '../../db'
import { AssistantPage, CoachChat } from './AssistantPage'
import { AssistantSettingsPage } from './AssistantSettingsPage'
import { AskCoachCard } from './cards'
import { COACH_THREAD } from './useCoachChat'
import { AI_KEYS, loadAiSettings } from './settings'
import { mockTool, scriptedProvider } from './test/mockProvider'
import type { ChatEvent, Provider } from './providers/types'

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/assistant" element={element} />
        <Route path="/assistant/settings" element={<AssistantSettingsPage />} />
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

// UI flows type and stream through several async hops; keep slow CI machines green.
vi.setConfig({ testTimeout: 15_000 })

beforeEach(async () => {
  await db.chatMessages.clear()
  await db.settings.bulkDelete(Object.values(AI_KEYS))
})

describe('AssistantPage', () => {
  it('shows onboarding with a link to settings and to the rules coach when no provider is configured', async () => {
    renderAt('/assistant', <AssistantPage />)
    expect(await screen.findByText('Подключи ИИ-тренера')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Настроить/ })).toHaveAttribute('href', '/assistant/settings')
    expect(screen.getByText('Советы по правилам уже работают')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Тренер/ })).toHaveAttribute('href', '/coach')
  })

  it('treats Gemini without a key as not configured, and opens the chat once a key is saved', async () => {
    await db.settings.put({ key: AI_KEYS.provider, value: 'gemini' })
    renderAt('/assistant', <AssistantPage />)
    expect(await screen.findByText('Подключи ИИ-тренера')).toBeInTheDocument()
    await db.settings.put({ key: AI_KEYS.geminiKey, value: 'AIza-test' })
    expect(await screen.findByText('Спроси тренера')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Что делать сегодня?' })).toBeInTheDocument()
  })
})

describe('CoachChat', () => {
  it('streams the reply and persists both messages in db.chatMessages', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const provider: Provider = {
      id: 'claude',
      label: 'Mock',
      isConfigured: () => true,
      async *chat(): AsyncGenerator<ChatEvent> {
        yield { type: 'text_delta', text: 'Сегодня день ног' }
        await gate
        yield { type: 'text_delta', text: ': присед **5×5**.' }
        yield { type: 'done', stopReason: 'end_turn' }
      },
    }
    const user = userEvent.setup()
    renderAt('/assistant', <CoachChat provider={provider} tools={[]} />)

    await user.type(screen.getByLabelText('Сообщение тренеру'), 'Что делать сегодня?')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Сегодня день ног')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Остановить' })).toBeInTheDocument()
    release()
    // The pending bubble is replaced by the persisted message — query inside waitFor.
    await waitFor(() => expect(screen.getByText('5×5')).toBeInTheDocument())

    await waitFor(async () => {
      const rows = await db.chatMessages.where('threadId').equals(COACH_THREAD).sortBy('createdAt')
      expect(rows.map((r) => [r.role, r.text])).toEqual([
        ['user', 'Что делать сегодня?'],
        ['assistant', 'Сегодня день ног: присед **5×5**.'],
      ])
      expect(rows[1].provider).toBe('claude')
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument())
  })

  it('shows a confirmation card for a mutating tool and writes only after «Записать»', async () => {
    const write = vi.fn(async () => ({ id: 'w1' }))
    const { provider } = scriptedProvider([
      [
        { type: 'tool_call', id: 't1', name: 'log_weight', input: { weightKg: 81.5 } },
        { type: 'done', stopReason: 'tool_use' },
      ],
      [{ type: 'text_delta', text: 'Записал вес.' }, { type: 'done', stopReason: 'end_turn' }],
    ])
    const user = userEvent.setup()
    renderAt('/assistant', <CoachChat provider={provider} tools={[mockTool('log_weight', write, true)]} />)

    await user.click(screen.getByRole('button', { name: 'Почему вес стоит?' }))
    expect(await screen.findByText('Тренер хочет записать')).toBeInTheDocument()
    expect(screen.getByText('Вес 81,5 кг')).toBeInTheDocument()
    expect(write).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Записать' }))
    await waitFor(() => expect(screen.getByText('Записал вес.')).toBeInTheDocument())
    expect(write).toHaveBeenCalledWith({ weightKg: 81.5 }, db)
    await waitFor(async () => {
      const last = (await db.chatMessages.where('threadId').equals(COACH_THREAD).sortBy('createdAt')).at(-1)
      expect(last?.toolCalls).toEqual([{ name: 'log_weight', input: { weightKg: 81.5 }, output: { id: 'w1' } }])
    })
    await waitFor(() => expect(screen.getByText(/Что тренер посмотрел/)).toBeInTheDocument())
  })

  it('shows provider errors with a retry button', async () => {
    const { provider } = scriptedProvider([[{ type: 'error', message: 'Лимит бесплатного тарифа Gemini исчерпан.' }]])
    const user = userEvent.setup()
    renderAt('/assistant', <CoachChat provider={provider} tools={[]} />)
    await user.type(screen.getByLabelText('Сообщение тренеру'), 'Привет{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Лимит бесплатного тарифа')
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
  })

  it('clears the conversation', async () => {
    await db.chatMessages.add({ id: 'm1', threadId: COACH_THREAD, role: 'user', text: 'Старый вопрос', createdAt: new Date().toISOString() })
    const { provider } = scriptedProvider([])
    const user = userEvent.setup()
    renderAt('/assistant', <CoachChat provider={provider} tools={[]} />)
    expect(await screen.findByText('Старый вопрос')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Очистить чат' }))
    await user.click(screen.getByRole('button', { name: 'Очистить' }))
    expect(await screen.findByText('Спроси тренера')).toBeInTheDocument()
    expect(await db.chatMessages.count()).toBe(0)
  })
})

describe('AssistantSettingsPage', () => {
  it('saves provider, Gemini key and model to settings', async () => {
    const user = userEvent.setup()
    renderAt('/assistant/settings', <AssistantSettingsPage />)
    await user.click(await screen.findByRole('radio', { name: 'Gemini' }))
    await user.type(screen.getByLabelText(/Ключ API Gemini/), 'AIza-123')
    expect(screen.getByText(/Оценка расходов/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(async () =>
      expect(await loadAiSettings()).toEqual({
        provider: 'gemini',
        geminiKey: 'AIza-123',
        geminiModel: 'gemini-2.5-flash',
        claudeProxyUrl: '/api/coach',
      }),
    )
  })
})

describe('AskCoachCard', () => {
  it('links three quick questions into the chat', async () => {
    await db.settings.put({ key: AI_KEYS.provider, value: 'gemini' })
    render(
      <MemoryRouter>
        <AskCoachCard />
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: 'Почему вес стоит?' })
    expect(link).toHaveAttribute('href', `/assistant?q=${encodeURIComponent('Почему вес стоит?')}`)
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })
})
