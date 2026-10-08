import { useCallback, useState, type FormEvent } from 'react'
import {
  Button,
  Card,
  Field,
  Icon,
  IconBadge,
  Input,
  PageHeader,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  type SegmentOption,
} from '../../components/ui'
import { checkClaudeProxy, CLAUDE_DEFAULT_PROXY } from './providers/claude'
import { checkGemini, GEMINI_DEFAULT_MODEL } from './providers/gemini'
import type { AiSettings } from './providers/types'
import { claudeCostRange, formatUsd } from './costs'
import { saveAiSettings, useAiSettings } from './settings'
import { GeminiModelField } from './GeminiModelField'

const PROVIDERS: SegmentOption<AiSettings['provider']>[] = [
  { value: 'off', label: 'Выключен' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'claude', label: 'Claude' },
]

type Check = { state: 'idle' } | { state: 'checking' } | { state: 'ok'; text: string } | { state: 'error'; text: string }

export function AssistantSettingsPage() {
  const settings = useAiSettings()
  return (
    <>
      <PageHeader title="ИИ-тренер" eyebrow="Настройки" back="/assistant" />
      {settings ? <SettingsForm initial={settings} /> : <Skeleton className="h-64" rounded="rounded-3xl" />}
    </>
  )
}

function SettingsForm({ initial }: { initial: AiSettings }) {
  const [values, setValues] = useState<AiSettings>(initial)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [check, setCheck] = useState<Check>({ state: 'idle' })

  const set = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setSaved(false)
    setCheck({ state: 'idle' })
  }

  const setModel = useCallback((model: string) => {
    setValues((v) => ({ ...v, geminiModel: model }))
    setSaved(false)
    setCheck({ state: 'idle' })
  }, [])

  const normalized = (): AiSettings => ({
    provider: values.provider,
    geminiKey: values.geminiKey.trim(),
    geminiModel: values.geminiModel.trim() || GEMINI_DEFAULT_MODEL,
    claudeProxyUrl: values.claudeProxyUrl.trim() || CLAUDE_DEFAULT_PROXY,
  })

  async function save(e?: FormEvent) {
    e?.preventDefault()
    const next = normalized()
    await saveAiSettings(next)
    setValues(next)
    setSaved(true)
  }

  async function runCheck() {
    await save()
    const next = normalized()
    setCheck({ state: 'checking' })
    try {
      if (next.provider === 'gemini') {
        if (!next.geminiKey) throw new Error('Вставь ключ Gemini.')
        const model = await checkGemini(next.geminiKey, next.geminiModel)
        setCheck({ state: 'ok', text: `Подключено: ${model} отвечает` })
      } else if (next.provider === 'claude') {
        const model = await checkClaudeProxy(next.claudeProxyUrl)
        setCheck({ state: 'ok', text: `Прокси работает: ${model}` })
      }
    } catch (err) {
      setCheck({ state: 'error', text: err instanceof Error ? err.message : 'Не удалось проверить подключение.' })
    }
  }

  const [low30, high30] = claudeCostRange(30)
  const [low1, high1] = claudeCostRange(1)

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <Card>
        <p className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Провайдер</p>
        <SegmentedControl
          aria-label="Провайдер ИИ"
          options={PROVIDERS}
          value={values.provider}
          onChange={(v) => set('provider', v)}
        />
        <p className="mt-2 text-sm text-muted">
          {values.provider === 'off' && 'ИИ выключен. Советы по правилам на экране «Тренер» работают без него.'}
          {values.provider === 'gemini' && 'Google Gemini — бесплатный тариф с личным ключом. Запросы идут напрямую из браузера в Google.'}
          {values.provider === 'claude' && 'Anthropic Claude Opus 5.5 — через твой прокси на Vercel. Ключ Anthropic хранится только на сервере.'}
        </p>
      </Card>

      {values.provider === 'gemini' && (
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <Field label="Ключ API Gemini" hint="aistudio.google.com → Get API key → Create API key. Ключ хранится только на этом устройстве.">
                <Input
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={values.geminiKey}
                  onChange={(e) => set('geminiKey', e.target.value)}
                  placeholder="AIza…"
                />
              </Field>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                >
                  Открыть Google AI Studio
                  <Icon name="chevron-right" size={16} />
                </a>
                <Button variant="ghost" size="sm" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? 'Скрыть ключ' : 'Показать ключ'}
                </Button>
              </div>
            </div>
            <GeminiModelField apiKey={values.geminiKey} value={values.geminiModel} onChange={setModel} />
          </div>
        </Card>
      )}

      {values.provider === 'claude' && (
        <Card>
          <Field
            label="URL прокси Claude"
            hint="На Vercel — /api/coach. Если приложение открыто с GitHub Pages, укажи полный адрес, например https://<проект>.vercel.app/api/coach."
          >
            <Input
              value={values.claudeProxyUrl}
              onChange={(e) => set('claudeProxyUrl', e.target.value)}
              spellCheck={false}
              inputMode="url"
              placeholder={CLAUDE_DEFAULT_PROXY}
            />
          </Field>
          <p className="mt-3 text-sm text-muted">
            На сервере нужны переменные окружения <code className="text-text">ANTHROPIC_API_KEY</code> и (для другого домена){' '}
            <code className="text-text">ALLOWED_ORIGIN</code>.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" icon={saved ? 'check' : undefined} className="min-w-32 flex-1">
          {saved ? 'Сохранено' : 'Сохранить'}
        </Button>
        {values.provider !== 'off' && (
          <Button
            variant="secondary"
            icon="activity"
            loading={check.state === 'checking'}
            onClick={() => void runCheck()}
            className="min-w-32 flex-1"
          >
            Проверить подключение
          </Button>
        )}
      </div>
      {(check.state === 'ok' || check.state === 'error') && (
        <p role="status" className={`flex items-start gap-2 text-sm ${check.state === 'ok' ? 'text-accent' : 'text-danger'}`}>
          <Icon name={check.state === 'ok' ? 'check' : 'info'} size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words whitespace-pre-line [overflow-wrap:anywhere]">{check.text}</span>
        </p>
      )}

      <SectionHeader title="Оценка расходов" icon="wallet" tone="amber" />
      <Card className="flex flex-col gap-4">
        <CostRow
          icon="sparkles"
          tone="info"
          title="Gemini (бесплатно)"
          body="0 ₽ в пределах лимитов бесплатного тарифа: несколько запросов в минуту и ограниченное число в день (лимиты задаёт Google). При превышении тренер попросит подождать. На бесплатном тарифе Google может использовать запросы для улучшения своих продуктов."
        />
        <CostRow
          icon="wallet"
          tone="amber"
          title="Claude Opus 5.5"
          body={`$4 за 1 млн входных и $20 за 1 млн выходных токенов. Один вопрос с просмотром данных — примерно ${formatUsd(low1)}–${formatUsd(high1)}, фото еды добавляет около 1–2 тыс. токенов. 30 вопросов в месяц ≈ ${formatUsd(low30)}–${formatUsd(high30)}.`}
        />
      </Card>
      <p className="px-1 text-xs text-muted">
        В ИИ уходят только ответы инструментов (сводки за нужные дни), а не вся база. История чата хранится на устройстве.
      </p>
    </form>
  )
}

function CostRow({
  icon,
  tone,
  title,
  body,
}: {
  icon: 'sparkles' | 'wallet'
  tone: 'info' | 'amber'
  title: string
  body: string
}) {
  return (
    <div className="flex gap-3">
      <IconBadge name={icon} tone={tone} size="sm" />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted">{body}</p>
      </div>
    </div>
  )
}
