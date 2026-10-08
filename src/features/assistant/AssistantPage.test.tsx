import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('«Повторить» re-runs the failed question without adding a second user message', async () => {
    const { provider, requests } = scriptedProvider([
      [{ type: 'error', message: 'Модель Gemini не найдена.' }],
      [{ type: 'error', message: 'Модель Gemini не найдена.' }],
      [{ type: 'text_delta', text: 'Вес стоит из-за воды.' }, { type: 'done', stopReason: 'end_turn' }],
    ])
    const user = userEvent.setup()
    renderAt('/assistant', <CoachChat provider={provider} tools={[]} />)
    const userRows = async () =>
      (await db.chatMessages.where('threadId').equals(COACH_THREAD).toArray()).filter((m) => m.role === 'user')

    await user.click(screen.getByRole('button', { name: 'Почему вес стоит?' }))
    await user.click(await screen.findByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(requests).toHaveLength(2))
    await user.click(await screen.findByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.getByText('Вес стоит из-за воды.')).toBeInTheDocument())

    expect((await userRows()).map((m) => m.text)).toEqual(['Почему вес стоит?'])
    expect(screen.getAllByText('Почему вес стоит?').filter((el) => el.tagName === 'P')).toHaveLength(1)
    expect(requests[2].messages.filter((t) => t.role === 'user')).toHaveLength(1)
  })

  it('does not duplicate the failed question when it is sent again', async () => {
    const { provider } = scriptedProvider([
      [{ type: 'error', message: 'Лимит' }],
      [{ type: 'text_delta', text: 'Готово' }, { type: 'done', stopReason: 'end_turn' }],
    ])
    const user = userEvent.setup()
    renderAt('/assistant', <CoachChat provider={provider} tools={[]} />)
    await user.type(screen.getByLabelText('Сообщение тренеру'), 'Что делать сегодня?{Enter}')
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Что делать сегодня?' }))
    await waitFor(() => expect(screen.getByText('Готово')).toBeInTheDocument())
    const rows = await db.chatMessages.where('threadId').equals(COACH_THREAD).sortBy('createdAt')
    expect(rows.map((r) => [r.role, r.text])).toEqual([
      ['user', 'Что делать сегодня?'],
      ['assistant', 'Готово'],
    ])
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

describe('AssistantSettingsPage — Gemini models', () => {
  const MODELS = {
    models: [
      { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
    ],
  }

  function stubFetch(generate: () => Response) {
    const fn = vi.fn(async (url: string) => (url.includes(':generateContent') ? generate() : new Response(JSON.stringify(MODELS))))
    vi.stubGlobal('fetch', fn)
    return fn
  }

  afterEach(() => vi.unstubAllGlobals())

  it('lists models for the key, pre-selects a flash model when the default is missing, and checks via generateContent', async () => {
    await db.settings.bulkPut([
      { key: AI_KEYS.provider, value: 'gemini' },
      { key: AI_KEYS.geminiKey, value: 'AIza-1' },
    ])
    const fetchMock = stubFetch(() => new Response(JSON.stringify({ candidates: [] })))
    const user = userEvent.setup()
    renderAt('/assistant/settings', <AssistantSettingsPage />)

    const select = await screen.findByRole('combobox')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Gemini 2.5 Pro · gemini-2.5-pro',
      'Gemini 2.0 Flash · gemini-2.0-flash',
    ])
    await waitFor(() => expect(select).toHaveValue('gemini-2.0-flash'))
    expect(screen.queryByText(/Модель недоступна/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Проверить подключение/ }))
    expect(await screen.findByRole('status')).toHaveTextContent('Подключено: gemini-2.0-flash')
    const call = fetchMock.mock.calls.find(([u]) => u.includes(':generateContent'))!
    expect(call[0]).toContain('/models/gemini-2.0-flash:generateContent?key=AIza-1')
    expect((await loadAiSettings()).geminiModel).toBe('gemini-2.0-flash')
  })

  it('warns when the saved model is not available and shows the API error on a failed check', async () => {
    await db.settings.bulkPut([
      { key: AI_KEYS.provider, value: 'gemini' },
      { key: AI_KEYS.geminiKey, value: 'AIza-1' },
      { key: AI_KEYS.geminiModel, value: 'gemini-1.0-pro' },
    ])
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 404, message: 'models/gemini-1.0-pro is not found for API version v1beta' } }), {
          status: 404,
        }),
    )
    const user = userEvent.setup()
    renderAt('/assistant/settings', <AssistantSettingsPage />)
    expect(await screen.findByText(/Модель недоступна для этого ключа/)).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: /Проверить подключение/ }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Модель Gemini не найдена: models/gemini-1.0-pro is not found for API version v1beta. Выбери модель из списка в настройках.',
    )

    await user.selectOptions(screen.getByRole('combobox'), 'gemini-2.5-pro')
    expect(screen.queryByText(/Модель недоступна/)).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('gemini-2.5-pro')).toBeInTheDocument()
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
