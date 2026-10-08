import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Field, Icon, Input, Select } from '../../components/ui'
import { GEMINI_DEFAULT_MODEL, listGeminiModels, pickGeminiModel, type GeminiModelInfo } from './providers/gemini'

type ListState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; models: GeminiModelInfo[] }
  | { state: 'error'; message: string }

/**
 * Gemini model picker: models available to this key for `generateContent`
 * (loaded from the API, «Обновить список»), plus a free-text fallback.
 */
export function GeminiModelField({
  apiKey,
  value,
  onChange,
}: {
  apiKey: string
  value: string
  onChange: (model: string) => void
}) {
  const [list, setList] = useState<ListState>({ state: 'idle' })
  const valueRef = useRef(value)
  const keyRef = useRef(apiKey)
  useEffect(() => {
    valueRef.current = value
    keyRef.current = apiKey
  })

  const load = useCallback(async () => {
    const key = keyRef.current.trim()
    if (!key) {
      setList({ state: 'error', message: 'Сначала вставь ключ Gemini.' })
      return
    }
    setList({ state: 'loading' })
    try {
      const models = await listGeminiModels(key)
      setList({ state: 'ready', models })
      const current = valueRef.current.trim()
      // Pre-select only when the user kept the default and it isn't offered for this key.
      if ((!current || current === GEMINI_DEFAULT_MODEL) && models.length) {
        const pick = pickGeminiModel(models, current || GEMINI_DEFAULT_MODEL)
        if (pick !== current) onChange(pick)
      }
    } catch (e) {
      setList({ state: 'error', message: e instanceof Error ? e.message : 'Не удалось загрузить список моделей.' })
    }
  }, [onChange])

  // Load once on open when a key is already saved.
  const loadedRef = useRef(false)
  useEffect(() => {
    if (loadedRef.current || !keyRef.current.trim()) return
    loadedRef.current = true
    void load()
  }, [load])

  const models = list.state === 'ready' ? list.models : []
  const known = models.some((m) => m.id === value.trim())
  const unavailable = list.state === 'ready' && value.trim() !== '' && !known

  return (
    <div className="flex flex-col gap-2">
      {list.state === 'ready' && models.length > 0 && (
        <Field label="Модель">
          <Select value={known ? value.trim() : ''} onChange={(e) => e.target.value && onChange(e.target.value)}>
            {!known && <option value="">— выбери модель —</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName === m.id ? m.id : `${m.displayName} · ${m.id}`}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field
        label={list.state === 'ready' && models.length > 0 ? 'Или id модели вручную' : 'Модель'}
        hint={`По умолчанию ${GEMINI_DEFAULT_MODEL}.`}
      >
        <Input value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} placeholder={GEMINI_DEFAULT_MODEL} />
      </Field>
      {unavailable && (
        <p role="alert" className="flex items-start gap-2 text-sm text-warn">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0">Модель недоступна для этого ключа. Выбери модель из списка.</span>
        </p>
      )}
      {list.state === 'error' && <p className="text-sm break-words text-danger [overflow-wrap:anywhere]">{list.message}</p>}
      {list.state === 'ready' && models.length === 0 && (
        <p className="text-sm text-muted">Для этого ключа нет моделей с генерацией текста.</p>
      )}
      <Button
        variant="ghost"
        size="sm"
        icon="history"
        loading={list.state === 'loading'}
        onClick={() => void load()}
        className="self-start"
      >
        Обновить список
      </Button>
    </div>
  )
}
