import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db as defaultDb, type ChatMessage, type FormaDB } from '../../db'
import { newId } from '../../lib/id'
import type { CoachTool } from '../coach/tools'
import { runAgentLoop, type ToolCallRecord } from './agentLoop'
import { buildCoachPrompt, historyToTurns, loadCoachContext } from './coachPrompt'
import type { PreparedImage } from './image'
import type { ChatPart, ChatTurn, Provider } from './providers/types'

export const COACH_THREAD = 'coach'

export const PHOTO_DEFAULT_PROMPT = 'Что на фото? Оцени порцию и КБЖУ и предложи записать.'

export interface PendingTool {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'running' | ToolCallRecord['status']
  output?: unknown
}

export interface PendingConfirm {
  id: string
  name: string
  input: Record<string, unknown>
  respond: (approved: boolean) => void
}

export interface PendingTurn {
  text: string
  tools: PendingTool[]
  confirm?: PendingConfirm
  notices: string[]
}

export interface UseCoachChat {
  messages: ChatMessage[] | undefined
  pending: PendingTurn | null
  busy: boolean
  error: string | null
  /** In-memory previews of photos sent this session, by message id */
  images: Record<string, string>
  send: (text: string, image?: PreparedImage | null) => Promise<void>
  retry: () => Promise<void>
  stop: () => void
  clear: () => Promise<void>
  dismissError: () => void
}

function threadMessages(database: FormaDB) {
  return database.chatMessages.where('threadId').equals(COACH_THREAD).sortBy('createdAt')
}

/** Chat state: persisted history (db.chatMessages) + the in-flight agent turn. */
export function useCoachChat({
  provider,
  tools,
  database = defaultDb,
}: {
  provider: Provider
  tools: CoachTool[]
  database?: FormaDB
}): UseCoachChat {
  const messages = useLiveQuery(() => threadMessages(database), [database])
  const [pending, setPending] = useState<PendingTurn | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [images, setImages] = useState<Record<string, string>>({})
  const abortRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const lastImageRef = useRef<PreparedImage | null>(null)
  /** Run whose partial answer must not be saved (chat was cleared mid-stream) */
  const discardRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const run = useCallback(
    async (image: PreparedImage | null) => {
      busyRef.current = true
      setError(null)
      const controller = new AbortController()
      abortRef.current = controller
      setPending({ text: '', tools: [], notices: [] })

      let text = ''
      let records: ToolCallRecord[] = []
      const persist = async (body: string, calls: ToolCallRecord[]) => {
        if (discardRef.current === controller) return
        if (!body.trim() && calls.length === 0) return
        await database.chatMessages.add({
          id: newId(),
          threadId: COACH_THREAD,
          role: 'assistant',
          text: body.trim(),
          provider: provider.id,
          toolCalls: calls.map((c) => ({ name: c.name, input: c.input, output: c.output })),
          createdAt: new Date().toISOString(),
        })
      }

      try {
        const stored = await threadMessages(database)
        const history: ChatTurn[] = historyToTurns(stored)
        // A retry after a partial answer must still end with the user's turn (no prefill).
        while (history.length && history[history.length - 1].role !== 'user') history.pop()
        if (history.length === 0) return
        // Attach the photo to the last user turn (photos are not persisted).
        const last = history[history.length - 1]
        if (image && last?.role === 'user') {
          last.parts = [{ type: 'image', mimeType: image.mimeType, data: image.data } as ChatPart, ...last.parts]
        }
        const system = buildCoachPrompt(await loadCoachContext(database))

        for await (const ev of runAgentLoop({
          provider,
          system,
          history,
          tools,
          db: database,
          signal: controller.signal,
        })) {
          switch (ev.type) {
            case 'text_delta':
              text += ev.text
              setPending((p) => p && { ...p, text: p.text + ev.text })
              break
            case 'tool_start':
              setPending(
                (p) => p && { ...p, tools: [...p.tools, { id: ev.id, name: ev.name, input: ev.input, status: 'running' }] },
              )
              break
            case 'tool_end':
              records = [...records, ev.record]
              setPending(
                (p) =>
                  p && {
                    ...p,
                    confirm: p.confirm?.id === ev.record.id ? undefined : p.confirm,
                    tools: p.tools.map((t) =>
                      t.id === ev.record.id ? { ...t, status: ev.record.status, output: ev.record.output } : t,
                    ),
                  },
              )
              break
            case 'confirm':
              setPending((p) => p && { ...p, confirm: { id: ev.id, name: ev.name, input: ev.input, respond: ev.respond } })
              break
            case 'notice':
              text += `${text ? '\n\n' : ''}*${ev.message}*`
              setPending((p) => p && { ...p, notices: [...p.notices, ev.message] })
              break
            case 'done':
              await persist(text, ev.toolCalls)
              lastImageRef.current = null
              setPending(null)
              break
            case 'error':
              await persist(ev.text, ev.toolCalls)
              setPending(null)
              setError(ev.message)
              break
          }
        }
        if (controller.signal.aborted) await persist(text, records)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Что-то пошло не так. Попробуй ещё раз.')
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        busyRef.current = false
        setPending(null)
      }
    },
    [database, provider, tools],
  )

  const send = useCallback(
    async (raw: string, image?: PreparedImage | null) => {
      const text = raw.trim() || (image ? PHOTO_DEFAULT_PROMPT : '')
      if (!text || busyRef.current) return
      busyRef.current = true
      const id = newId()
      await database.chatMessages.add({
        id,
        threadId: COACH_THREAD,
        role: 'user',
        text: image ? `[Фото еды] ${text}` : text,
        createdAt: new Date().toISOString(),
      })
      if (image) setImages((m) => ({ ...m, [id]: image.dataUrl }))
      lastImageRef.current = image ?? null
      await run(image ?? null)
    },
    [database, run],
  )

  const retry = useCallback(async () => {
    if (busyRef.current) return
    await run(lastImageRef.current)
  }, [run])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const clear = useCallback(async () => {
    if (abortRef.current) {
      discardRef.current = abortRef.current
      abortRef.current.abort()
    }
    await database.chatMessages.where('threadId').equals(COACH_THREAD).delete()
    setImages({})
    setError(null)
  }, [database])

  return {
    messages,
    pending,
    busy: pending !== null,
    error,
    images,
    send,
    retry,
    stop,
    clear,
    dismissError: () => setError(null),
  }
}
