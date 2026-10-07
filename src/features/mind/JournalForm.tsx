import { useState } from 'react'
import { Button, Card, Field, IconBadge, Input, SegmentedControl } from '../../components/ui'
import { db } from '../../db'
import type { ISODate, JournalEntry } from '../../db/types'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import { cleanItems, JOURNAL_KIND_LABEL, parseTags, REVIEW_PROMPTS, type JournalKind } from './calc'
import { AutoTextarea } from './parts'
import { REVIEW_BADGES } from './styles'

const MAX_GRATITUDE = 5

const REVIEW_PLACEHOLDERS = ['Что сегодня удалось', 'Что в следующий раз сделать иначе', 'Одно дело, которое важнее всего']

function initialItems(kind: JournalKind, entry?: JournalEntry): string[] {
  if (kind === 'evening_review') return [0, 1, 2].map((i) => entry?.items?.[i] ?? '')
  if (kind === 'gratitude') {
    const items = entry?.items ?? []
    return items.length > 0 ? items.slice(0, MAX_GRATITUDE) : ['', '', '']
  }
  return []
}

/**
 * Editor for every journal kind: gratitude (1–5 lines), evening review (3 fixed prompts),
 * free / reflection (auto-growing text + tags). Saves with `db.journal.put`.
 */
export function JournalForm({
  kind: initialKind,
  entry,
  fixedDate,
  onSaved,
  onCancel,
  submitLabel = 'Сохранить',
}: {
  kind: JournalKind
  entry?: JournalEntry
  /** Hide the date field and always save on this date (evening review). */
  fixedDate?: ISODate
  onSaved: (e: JournalEntry) => void
  onCancel?: () => void
  submitLabel?: string
}) {
  const [kind, setKind] = useState<JournalKind>(entry?.kind ?? initialKind)
  const [date, setDate] = useState<ISODate>(fixedDate ?? entry?.date ?? today())
  const [items, setItems] = useState<string[]>(() => initialItems(entry?.kind ?? initialKind, entry))
  const [text, setText] = useState(entry?.text ?? '')
  const [tags, setTags] = useState((entry?.tags ?? []).join(', '))
  const [saving, setSaving] = useState(false)

  const isText = kind === 'free' || kind === 'reflection'
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(date) && (isText ? text.trim() !== '' : cleanItems(items).length > 0)

  function setItem(i: number, v: string) {
    setItems((cur) => cur.map((x, j) => (j === i ? v : x)))
  }

  async function save() {
    if (!valid) return
    setSaving(true)
    const parsedTags = parseTags(tags)
    const out: JournalEntry = {
      id: entry?.id ?? newId(),
      date: fixedDate ?? date,
      kind,
      ...(kind === 'gratitude' ? { items: cleanItems(items) } : {}),
      ...(kind === 'evening_review' ? { items: items.map((s) => s.trim()) } : {}),
      ...(isText ? { text: text.trim() } : {}),
      ...(isText && parsedTags.length > 0 ? { tags: parsedTags } : {}),
      createdAt: entry?.createdAt ?? new Date().toISOString(),
    }
    await db.journal.put(out)
    setSaving(false)
    onSaved(out)
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      {!entry && isText && (
        <SegmentedControl
          aria-label="Тип записи"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'free', label: JOURNAL_KIND_LABEL.free, icon: 'edit' },
            { value: 'reflection', label: JOURNAL_KIND_LABEL.reflection, icon: 'brain' },
          ]}
        />
      )}

      {!fixedDate && (
        <Field label="Дата">
          <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}

      {kind === 'gratitude' && (
        <Card as="div" tone="pink">
        <fieldset className="space-y-2">
          <legend className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <IconBadge name="heart" tone="pink" size="sm" />
            3 вещи, за которые я благодарен сегодня
          </legend>
          {items.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-pink/15 text-xs font-semibold text-pink tabular-nums">
                {i + 1}
              </span>
              <Input
                aria-label={`Благодарность ${i + 1}`}
                placeholder={i === 0 ? 'Например: тёплый разговор с другом' : ''}
                value={v}
                onChange={(e) => setItem(i, e.target.value)}
              />
              {items.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon="x"
                  className="w-9 shrink-0 px-0"
                  aria-label={`Убрать строку ${i + 1}`}
                  onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))}
                />
              )}
            </div>
          ))}
          {items.length < MAX_GRATITUDE && (
            <Button variant="ghost" size="sm" onClick={() => setItems((cur) => [...cur, ''])}>
              + Ещё строка
            </Button>
          )}
        </fieldset>
        </Card>
      )}

      {kind === 'evening_review' &&
        REVIEW_PROMPTS.map((label, i) => (
          <Card key={label} tone={REVIEW_BADGES[i].tone}>
            <label className="block">
              <span className="mb-2.5 flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
                <IconBadge name={REVIEW_BADGES[i].icon} tone={REVIEW_BADGES[i].tone} size="sm" />
                {label}
              </span>
              <AutoTextarea rows={2} value={items[i] ?? ''} placeholder={REVIEW_PLACEHOLDERS[i]} onChange={(e) => setItem(i, e.target.value)} />
            </label>
          </Card>
        ))}

      {isText && (
        <>
          <Field label={kind === 'reflection' ? 'Размышление' : 'Запись'}>
            <AutoTextarea
              rows={5}
              value={text}
              placeholder={kind === 'reflection' ? 'О чём вы думаете? Что поняли сегодня?' : 'Пишите свободно — это только для вас'}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <Field label="Теги" hint="Через запятую">
            <Input value={tags} placeholder="работа, идеи" onChange={(e) => setTags(e.target.value)} />
          </Field>
        </>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="lg" icon="check" className="flex-1" disabled={!valid || saving}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button size="lg" variant="secondary" onClick={onCancel}>
            Отмена
          </Button>
        )}
      </div>
    </form>
  )
}
