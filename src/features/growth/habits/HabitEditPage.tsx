import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router'
import { Button, EmptyState, Field, Input, PageHeader, Select, Stepper } from '../../../components/ui'
import { db } from '../../../db'
import type { Habit, HabitAutoRule } from '../../../db/types'
import { newId } from '../../../lib/id'
import { COLOR_TOKENS, colorVar, tint } from '../shared'
import { AUTO_RULE_RU, AUTO_RULES } from './calc'
import { COLOR_RU, HABIT_EMOJI } from './meta'

type Draft = Pick<Habit, 'name' | 'icon' | 'color' | 'frequency' | 'targetPerWeek' | 'autoRule'>

const EMPTY: Draft = { name: '', icon: HABIT_EMOJI[0], color: 'accent', frequency: 'daily', targetPerWeek: 3, autoRule: null }

const segment = (active: boolean) =>
  `min-h-11 flex-1 rounded-xl border px-3 text-sm transition-colors ${
    active ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2 text-muted hover:text-text'
  }`

export function HabitEditPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const habit = useLiveQuery(async () => (isNew ? null : ((await db.habits.get(id!)) ?? null)), [id, isNew])

  if (!isNew && habit === undefined) return null
  if (!isNew && habit === null) {
    return (
      <>
        <PageHeader title="Привычка" back="/habits" />
        <EmptyState title="Привычка не найдена" />
      </>
    )
  }
  return <HabitForm key={habit?.id ?? 'new'} habit={habit ?? null} />
}

function HabitForm({ habit }: { habit: Habit | null }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(() =>
    habit
      ? {
          name: habit.name,
          icon: habit.icon,
          color: habit.color,
          frequency: habit.frequency,
          targetPerWeek: habit.targetPerWeek ?? 3,
          autoRule: habit.autoRule,
        }
      : EMPTY,
  )
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  async function save(e: FormEvent) {
    e.preventDefault()
    const name = draft.name.trim()
    if (!name) return
    const fields = {
      ...draft,
      name,
      targetPerWeek: draft.frequency === 'weekly' ? (draft.targetPerWeek ?? 3) : undefined,
    }
    if (habit) {
      await db.habits.update(habit.id, fields)
    } else {
      const all = await db.habits.toArray()
      const sort = all.reduce((m, h) => Math.max(m, h.sort), -1) + 1
      await db.habits.add({ id: newId(), ...fields, sort, archived: false, createdAt: new Date().toISOString() })
    }
    navigate('/habits')
  }

  async function toggleArchive() {
    if (!habit) return
    await db.habits.update(habit.id, { archived: !habit.archived })
    navigate('/habits')
  }

  async function remove() {
    if (!habit) return
    if (!window.confirm(`Удалить привычку «${habit.name}» и всю её историю?`)) return
    await db.transaction('rw', db.habits, db.habitLogs, async () => {
      await db.habitLogs.where('habitId').equals(habit.id).delete()
      await db.habits.delete(habit.id)
    })
    navigate('/habits')
  }

  return (
    <>
      <PageHeader title={habit ? 'Изменить привычку' : 'Новая привычка'} back="/habits" />
      <form onSubmit={save} className="space-y-5">
        <Field label="Название">
          <Input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Например, медитация" required autoFocus={!habit} />
        </Field>

        <fieldset>
          <legend className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Иконка</legend>
          <div className="grid grid-cols-8 gap-1.5">
            {HABIT_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={`Иконка ${e}`}
                aria-pressed={draft.icon === e}
                onClick={() => set('icon', e)}
                className={`grid aspect-square min-h-10 place-items-center rounded-xl border text-xl transition-transform active:scale-95 ${
                  draft.icon === e ? 'border-accent bg-accent/15' : 'border-border bg-surface-2'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Цвет</legend>
          <div className="flex flex-wrap gap-3">
            {COLOR_TOKENS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={COLOR_RU[c]}
                aria-pressed={draft.color === c}
                onClick={() => set('color', c)}
                className="grid size-11 place-items-center rounded-full border-2 transition-transform active:scale-95"
                style={{ borderColor: draft.color === c ? colorVar(c) : 'transparent', backgroundColor: tint(c, 20) }}
              >
                <span className="size-6 rounded-full" style={{ backgroundColor: colorVar(c) }} />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Частота</legend>
          <div className="flex gap-2">
            <button type="button" aria-pressed={draft.frequency === 'daily'} className={segment(draft.frequency === 'daily')} onClick={() => set('frequency', 'daily')}>
              Ежедневно
            </button>
            <button type="button" aria-pressed={draft.frequency === 'weekly'} className={segment(draft.frequency === 'weekly')} onClick={() => set('frequency', 'weekly')}>
              N раз в неделю
            </button>
          </div>
          {draft.frequency === 'weekly' && (
            <div className="mt-2 flex items-center gap-3">
              <Stepper
                aria-label="Раз в неделю"
                value={draft.targetPerWeek ?? 3}
                min={1}
                max={7}
                onChange={(v) => set('targetPerWeek', v ?? 1)}
              />
              <span className="text-sm text-muted">раз в неделю</span>
            </div>
          )}
        </fieldset>

        <Field label="Авто-отметка" hint="Привычка отмечается сама по данным приложения; ручная отметка всё равно работает.">
          <Select value={draft.autoRule ?? ''} onChange={(e) => set('autoRule', (e.target.value || null) as HabitAutoRule)}>
            <option value="">Нет — только вручную</option>
            {AUTO_RULES.map((r) => (
              <option key={r} value={r}>
                {AUTO_RULE_RU[r]}
              </option>
            ))}
          </Select>
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={!draft.name.trim()}>
          Сохранить
        </Button>
      </form>

      {habit && (
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => void toggleArchive()}>
            {habit.archived ? 'Вернуть из архива' : 'Архивировать'}
          </Button>
          <Button variant="danger" className="flex-1" onClick={() => void remove()}>
            Удалить
          </Button>
        </div>
      )}
    </>
  )
}
