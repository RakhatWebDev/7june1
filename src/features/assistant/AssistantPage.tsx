import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import type { ChatMessage } from '../../db'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  IconBadge,
  LinkButton,
  PageHeader,
  Sheet,
  Skeleton,
} from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import { COACH_TOOLS, type CoachTool } from '../coach/tools'
import { Markdown } from './Markdown'
import { QUICK_QUESTIONS } from './questions'
import { prepareImage, type PreparedImage } from './image'
import type { Provider } from './providers/types'
import { providerFromSettings, useAiSettings } from './settings'
import { describeMutation, toolMeta } from './toolLabels'
import { useCoachChat, type PendingConfirm, type PendingTool, type PendingTurn } from './useCoachChat'


const PROVIDER_LABEL = { gemini: 'Gemini', claude: 'Claude', rules: 'Правила' } as const

export function AssistantPage() {
  const settings = useAiSettings()
  const provider = useMemo(() => (settings ? providerFromSettings(settings) : null), [settings])
  if (!settings) {
    return (
      <>
        <PageHeader title="ИИ-тренер" back="/" />
        <Skeleton className="h-40" rounded="rounded-3xl" />
      </>
    )
  }
  if (!provider) return <AssistantOnboarding />
  return <CoachChat key={`${provider.id}:${settings.geminiModel}:${settings.claudeProxyUrl}`} provider={provider} />
}

/* ----------------------------- Onboarding ----------------------------- */

const STEPS: { title: string; body: string }[] = [
  { title: 'Выбери провайдера', body: 'Gemini — бесплатно с личным ключом. Claude — через свой прокси на Vercel.' },
  {
    title: 'Получи ключ',
    body: 'Для Gemini: aistudio.google.com → Get API key. Ключ хранится только на этом устройстве.',
  },
  { title: 'Проверь подключение', body: 'Вставь ключ в настройках и нажми «Проверить подключение» — готово.' },
]

export function AssistantOnboarding() {
  return (
    <>
      <PageHeader title="ИИ-тренер" back="/" />
      <Card variant="elevated" className="mb-3">
        <div className="mb-4 flex items-center gap-3">
          <IconBadge name="sparkles" tone="violet" size="lg" />
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-tight">Подключи ИИ-тренера</h2>
            <p className="text-sm text-muted">Он видит твои тренировки, питание и сон и отвечает по делу.</p>
          </div>
        </div>
        <ol className="flex flex-col gap-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <LinkButton to="/assistant/settings" className="mt-5 w-full" size="lg" icon="settings">
          Настроить
        </LinkButton>
      </Card>
      <Card className="flex items-center gap-3">
        <IconBadge name="target" tone="accent" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Советы по правилам уже работают</p>
          <p className="text-sm text-muted">Прогрессия, сон, питание — без ИИ и без ключей.</p>
        </div>
        <LinkButton to="/coach" variant="secondary" size="sm" iconRight="chevron-right">
          Тренер
        </LinkButton>
      </Card>
    </>
  )
}

/* -------------------------------- Chat -------------------------------- */

function CameraIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L7.5 6.5H5A2 2 0 0 0 3 8.5v9A2 2 0 0 0 5 19.5h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

export function CoachChat({ provider, tools = COACH_TOOLS }: { provider: Provider; tools?: CoachTool[] }) {
  const chat = useCoachChat({ provider, tools })
  const [draft, setDraft] = useState('')
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [params, setParams] = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const askedRef = useRef(false)
  const reduce = useReduceMotion()

  // `/assistant?q=…` (from AskCoachCard) sends the question once.
  const q = params.get('q')
  const { send } = chat
  useEffect(() => {
    if (!q || askedRef.current) return
    askedRef.current = true
    setParams({}, { replace: true })
    void send(q)
  }, [q, send, setParams])

  const count = chat.messages?.length ?? 0
  const pendingLen = (chat.pending?.text.length ?? 0) + (chat.pending?.tools.length ?? 0)
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: reduce ? 'auto' : 'smooth' })
  }, [count, pendingLen, chat.pending?.confirm, chat.error, reduce])

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (chat.busy || (!draft.trim() && !image)) return
    const text = draft
    const img = image
    setDraft('')
    setImage(null)
    await chat.send(text, img)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImageError(null)
    setImageBusy(true)
    try {
      setImage(await prepareImage(file))
    } catch {
      setImageError('Не удалось открыть фото. Попробуй другое изображение.')
    } finally {
      setImageBusy(false)
    }
  }

  const empty = count === 0 && !chat.pending

  return (
    <>
      <PageHeader
        title="ИИ-тренер"
        eyebrow={PROVIDER_LABEL[provider.id]}
        back="/"
        action={
          <div className="flex items-center gap-1.5">
            {count > 0 && (
              <Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirmClear(true)} aria-label="Очистить чат">
                <span className="max-[380px]:sr-only">Очистить</span>
              </Button>
            )}
            <Link
              to="/assistant/settings"
              aria-label="Настройки ИИ"
              className="grid size-10 place-items-center rounded-full border border-white/[0.06] bg-surface-2 text-muted transition-colors hover:text-text"
            >
              <Icon name="settings" size={20} />
            </Link>
          </div>
        }
      />

      {empty ? (
        <EmptyState
          icon="sparkles"
          tone="violet"
          title="Спроси тренера"
          hint="Он посмотрит твои тренировки, питание, сон и вес и ответит по делу. Можно прислать фото еды."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_QUESTIONS.map((question) => (
                <Chip key={question} onClick={() => void send(question)} icon="sparkles">
                  {question}
                </Chip>
              ))}
            </div>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-live="polite" aria-label="Сообщения">
          {chat.messages?.map((m) => (
            <MessageItem key={m.id} message={m} image={chat.images[m.id]} />
          ))}
          {chat.pending && <PendingItem pending={chat.pending} />}
        </ul>
      )}

      {chat.error && (
        <Card variant="accent" tone="danger" className="mt-3" padding="sm">
          <div className="flex items-start gap-2.5" role="alert">
            <Icon name="info" size={18} className="mt-0.5 shrink-0 text-danger" />
            <p className="min-w-0 flex-1 text-sm">{chat.error}</p>
          </div>
          <div className="mt-2.5 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={chat.dismissError}>
              Скрыть
            </Button>
            <Button variant="secondary" size="sm" icon="history" onClick={() => void chat.retry()}>
              Повторить
            </Button>
          </div>
        </Card>
      )}

      <div ref={endRef} className="h-px" />

      <div className="sticky bottom-[calc(var(--safe-bottom)+68px)] z-30 mt-3 -mx-1 px-1">
        {!empty && !chat.busy && (
          <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            {QUICK_QUESTIONS.map((question) => (
              <Chip key={question} onClick={() => void send(question)} className="shrink-0">
                {question}
              </Chip>
            ))}
          </div>
        )}
        <form
          onSubmit={submit}
          className="rounded-3xl border border-white/[0.08] bg-surface-2/95 p-2 shadow-[var(--shadow-float)] backdrop-blur-xl"
        >
          {(image || imageBusy || imageError) && (
            <div className="mb-2 flex items-center gap-2 px-1">
              {image && (
                <span className="relative">
                  <img src={image.dataUrl} alt="Фото для тренера" className="size-14 rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => setImage(null)}
                    aria-label="Убрать фото"
                    className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-surface-3 text-text"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </span>
              )}
              {imageBusy && <span className="text-sm text-muted">Сжимаю фото…</span>}
              {imageError && <span className="text-sm text-danger">{imageError}</span>}
              {image && <span className="min-w-0 text-xs text-muted">Тренер оценит КБЖУ и предложит записать</span>}
            </div>
          )}
          <div className="flex items-end gap-1.5">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} data-testid="photo-input" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={chat.busy || imageBusy}
              aria-label="Фото еды"
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-text disabled:opacity-40"
            >
              <CameraIcon />
            </button>
            <label htmlFor="coach-input" className="sr-only">
              Сообщение тренеру
            </label>
            <textarea
              id="coach-input"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={image ? 'Вопрос к фото (необязательно)' : 'Спроси тренера…'}
              className="max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-snug text-text outline-none placeholder:text-muted [field-sizing:content]"
            />
            {chat.busy ? (
              <Button variant="secondary" size="sm" onClick={chat.stop} aria-label="Остановить" className="size-10 shrink-0 px-0!">
                <Icon name="pause" size={18} />
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={!draft.trim() && !image}
                aria-label="Отправить"
                className="size-10 shrink-0 rounded-full px-0!"
              >
                <Icon name="arrow-up" size={20} />
              </Button>
            )}
          </div>
        </form>
        <p className="mt-1.5 text-center text-[11px] text-muted">ИИ может ошибаться. Это не медицинская консультация.</p>
      </div>

      <Sheet open={confirmClear} onClose={() => setConfirmClear(false)} title="Очистить чат?">
        <p className="mb-4 text-sm text-muted">История переписки с тренером удалится с этого устройства. Твои записи не пострадают.</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmClear(false)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            icon="trash"
            onClick={() => {
              setConfirmClear(false)
              void chat.clear()
            }}
          >
            Очистить
          </Button>
        </div>
      </Sheet>
    </>
  )
}

/* ------------------------------ Messages ------------------------------ */

function CoachAvatar() {
  return (
    <span
      aria-hidden
      className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-violet),var(--color-accent))] text-bg"
    >
      <Icon name="sparkles" size={16} />
    </span>
  )
}

function MessageItem({ message, image }: { message: ChatMessage; image?: string }) {
  if (message.role === 'user') {
    const text = message.text.replace(/^\[Фото еды\]\s*/, '')
    const isPhoto = text !== message.text
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] min-w-0 rounded-3xl rounded-br-lg bg-accent/15 px-4 py-2.5 text-[15px] leading-snug text-text">
          {image && <img src={image} alt="Фото еды" className="mb-2 max-h-48 w-full rounded-2xl object-cover" />}
          {isPhoto && !image && (
            <span className="mb-1 flex items-center gap-1 text-xs text-muted">
              <CameraIcon size={14} /> Фото еды
            </span>
          )}
          <p className="break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>
        </div>
      </li>
    )
  }
  if (message.role !== 'assistant') return null
  const calls = message.toolCalls ?? []
  return (
    <li className="flex gap-2.5">
      <CoachAvatar />
      <div className="min-w-0 flex-1">
        {calls.length > 0 && (
          <ToolList
            tools={calls.map((c, i) => ({
              id: String(i),
              name: c.name,
              input: (c.input ?? {}) as Record<string, unknown>,
              output: c.output,
              status: storedStatus(c.output),
            }))}
          />
        )}
        {message.text && (
          <div className="rounded-3xl rounded-tl-lg border border-white/[0.06] bg-surface px-4 py-2.5 text-[15px] leading-relaxed text-text/90">
            <Markdown text={message.text} />
          </div>
        )}
      </div>
    </li>
  )
}

function storedStatus(output: unknown): PendingTool['status'] {
  if (output && typeof output === 'object') {
    if ((output as { declined?: unknown }).declined === true) return 'declined'
    if ('error' in output) return 'error'
  }
  return 'ok'
}

function PendingItem({ pending }: { pending: PendingTurn }) {
  const running = pending.tools.some((t) => t.status === 'running')
  return (
    <li className="flex gap-2.5" aria-busy="true">
      <CoachAvatar />
      <div className="min-w-0 flex-1">
        {pending.tools.length > 0 && <ToolList tools={pending.tools} live />}
        {pending.confirm && <ConfirmCard confirm={pending.confirm} />}
        {pending.text ? (
          <div className="rounded-3xl rounded-tl-lg border border-white/[0.06] bg-surface px-4 py-2.5 text-[15px] leading-relaxed text-text/90">
            <Markdown text={pending.text} />
          </div>
        ) : (
          !pending.confirm && <Typing label={running ? 'смотрит данные…' : 'печатает…'} />
        )}
        {pending.notices.map((n) => (
          <p key={n} className="mt-1.5 text-xs text-muted">
            {n}
          </p>
        ))}
      </div>
    </li>
  )
}

function Typing({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-3xl rounded-tl-lg border border-white/[0.06] bg-surface px-4 py-3 text-sm text-muted">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      Тренер {label}
    </div>
  )
}

const STATUS_RU: Record<PendingTool['status'], string> = {
  running: 'загрузка…',
  ok: '',
  error: 'ошибка',
  declined: 'отменено',
}

function ToolList({ tools, live = false }: { tools: PendingTool[]; live?: boolean }) {
  return (
    <details className="group mb-2 rounded-2xl border border-white/[0.06] bg-surface/60 text-sm" open={live || undefined}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-muted select-none [&::-webkit-details-marker]:hidden">
        <Icon name="search" size={14} />
        <span className="min-w-0 flex-1 truncate">Что тренер посмотрел · {tools.length}</span>
        <Icon name="chevron-down" size={16} className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <ul className="flex flex-col gap-1 px-2 pb-2">
        {tools.map((t) => (
          <ToolRow key={t.id} tool={t} />
        ))}
      </ul>
    </details>
  )
}

function ToolRow({ tool }: { tool: PendingTool }) {
  const meta = toolMeta(tool.name)
  const [open, setOpen] = useState(false)
  const reduce = useReduceMotion()
  const status = STATUS_RU[tool.status]
  const hasInput = Object.keys(tool.input).length > 0
  return (
    <li className="rounded-xl bg-surface-2/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-9 w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <Icon
          name={tool.status === 'running' ? 'timer' : tool.status === 'ok' ? 'check' : meta.icon}
          size={14}
          className={tool.status === 'ok' ? 'text-accent' : tool.status === 'running' ? 'text-muted' : 'text-warn'}
        />
        <span className="min-w-0 flex-1 truncate text-text/90">{meta.label}</span>
        {status && <span className="shrink-0 text-xs text-muted">{status}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="overflow-hidden"
          >
            <pre className="mx-2.5 mb-2 max-h-48 overflow-auto rounded-lg bg-bg/60 p-2 text-[11px] leading-snug whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">
              {hasInput ? `→ ${JSON.stringify(tool.input)}\n` : ''}
              {tool.output === undefined ? '…' : `← ${JSON.stringify(tool.output, null, 1).slice(0, 2000)}`}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

function ConfirmCard({ confirm }: { confirm: PendingConfirm }) {
  const meta = toolMeta(confirm.name)
  return (
    <Card variant="accent" tone="warn" className="mb-2" padding="sm">
      <div className="flex items-start gap-3" role="group" aria-label="Подтверждение записи">
        <IconBadge name={meta.icon} tone="warn" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Тренер хочет записать</p>
          <p className="mt-0.5 font-medium break-words [overflow-wrap:anywhere]">{meta.label}</p>
          <p className="text-sm break-words text-text/80 [overflow-wrap:anywhere]">{describeMutation(confirm.name, confirm.input)}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => confirm.respond(false)}>
          Отмена
        </Button>
        <Button size="sm" className="flex-1" icon="check" onClick={() => confirm.respond(true)}>
          Записать
        </Button>
      </div>
    </Card>
  )
}
