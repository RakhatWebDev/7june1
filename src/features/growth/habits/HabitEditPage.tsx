import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Stepper,
} from '../../../components/ui'
import { useReduceMotion } from '../../../components/ui/helpers'
import { db } from '../../../db'
import type { Habit, HabitAutoRule } from '../../../db/types'
import { newId } from '../../../lib/id'
import { Icon } from '../../../components/icons'
import { COLOR_TOKENS, colorVar, tint } from '../shared'
import { AUTO_RULE_RU, AUTO_RULES } from './calc'
import { COLOR_RU, HABIT_EMOJI } from './meta'

type Draft = Pick<Habit, 'name' | 'icon' | 'color' | 'frequency' | 'targetPerWeek' | 'autoRule'>

const EMPTY: Draft = { name: '', icon: HABIT_EMOJI[0], color: 'accent', frequency: 'daily', targetPerWeek: 3, autoRule: null }

const legendClass = 'mb-2 text-xs font-medium tracking-wide text-muted uppercase'

export function HabitEditPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const habit = useLiveQuery(async () => (isNew ? null : ((await db.habits.get(id!)) ?? null)), [id, isNew])

  if (!isNew && habit === undefined) return null
  if (!isNew && habit === null) {
    return (
      <>
        <PageHeader title="Привычка" back="/habits" />
        <EmptyState icon="search" tone="pink" title="Привычка не найдена" />
      </>
    )
  }
  return <HabitForm key={habit?.id ?? 'new'} habit={habit ?? null} />
}

function HabitForm({ habit }: { habit: Habit | null }) {
  const navigate = useNavigate()
  const reduce = useReduceMotion()
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
        <Card
          variant="elevated"
          className="flex items-center gap-3"
          style={{
            backgroundImage: `radial-gradient(120% 120% at 100% 0%, ${tint(draft.color, 22)} 0%, transparent 70%), var(--gradient-elevated)`,
          }}
        >
          <motion.span
            key={draft.icon}
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-2xl text-3xl leading-none"
            style={{ backgroundColor: tint(draft.color, 22) }}
            initial={reduce ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            {draft.icon}
          </motion.span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Предпросмотр</p>
            <p className="truncate text-lg font-semibold tracking-tight">{draft.name.trim() || 'Новая привычка'}</p>
            <p className="text-xs text-muted tabular-nums">
              {draft.frequency === 'daily' ? 'Каждый день' : `${draft.targetPerWeek ?? 3} раз в неделю`}
              {draft.autoRule ? ` · авто: ${AUTO_RULE_RU[draft.autoRule].toLowerCase()}` : ''}
            </p>
          </div>
        </Card>

        <Field label="Название">
          <Input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Например, медитация" required autoFocus={!habit} />
        </Field>

        <fieldset>
          <legend className={legendClass}>Иконка</legend>
          <div className="grid grid-cols-8 gap-1.5">
            {HABIT_EMOJI.map((e) => {
              const active = draft.icon === e
              return (
                <motion.button
                  key={e}
                  type="button"
                  aria-label={`Иконка ${e}`}
                  aria-pressed={active}
                  onClick={() => set('icon', e)}
                  whileTap={reduce ? undefined : { scale: 0.85 }}
                  animate={reduce ? undefined : { scale: active ? 1.06 : 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className={`grid aspect-square min-h-10 min-w-0 place-items-center rounded-xl border text-xl transition-[background-color,border-color] duration-150 ${
                    active ? '' : 'border-white/[0.05] bg-surface-2 hover:bg-surface-3'
                  }`}
                  style={active ? { borderColor: colorVar(draft.color), backgroundColor: tint(draft.color, 18) } : undefined}
                >
                  {e}
                </motion.button>
              )
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className={legendClass}>Цвет</legend>
          <div className="flex flex-wrap gap-3">
            {COLOR_TOKENS.map((c) => {
              const active = draft.color === c
              return (
                <motion.button
                  key={c}
                  type="button"
                  aria-label={COLOR_RU[c]}
                  aria-pressed={active}
                  onClick={() => set('color', c)}
                  whileTap={reduce ? undefined : { scale: 0.88 }}
                  className="relative grid size-11 place-items-center rounded-full"
                  style={{ backgroundColor: tint(c, 16) }}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-0 rounded-full border-2 transition-[opacity,transform] duration-200 ${
                      active ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                    }`}
                    style={{ borderColor: colorVar(c) }}
                  />
                  <span
                    aria-hidden
                    className={`grid size-6 place-items-center rounded-full text-bg transition-transform duration-200 ${active ? 'scale-110' : ''}`}
                    style={{ backgroundColor: colorVar(c), boxShadow: active ? `0 0 14px -2px ${colorVar(c)}` : undefined }}
                  >
                    {active && <Icon name="check" size={14} strokeWidth={3} />}
                  </span>
                </motion.button>
              )
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className={legendClass}>Частота</legend>
          <SegmentedControl
            aria-label="Частота"
            value={draft.frequency}
            onChange={(v) => set('frequency', v)}
            options={[
              { value: 'daily', label: 'Ежедневно' },
              { value: 'weekly', label: 'N раз в неделю' },
            ]}
          />
          {draft.frequency === 'weekly' && (
            <motion.div
              className="mt-3 flex items-center gap-3"
              initial={reduce ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              <Stepper
                aria-label="Раз в неделю"
                value={draft.targetPerWeek ?? 3}
                min={1}
                max={7}
                onChange={(v) => set('targetPerWeek', v ?? 1)}
              />
              <span className="text-sm text-muted">раз в неделю</span>
            </motion.div>
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
          <Button variant="secondary" className="flex-1" icon="history" onClick={() => void toggleArchive()}>
            {habit.archived ? 'Вернуть из архива' : 'Архивировать'}
          </Button>
          <Button variant="danger" className="flex-1" icon="trash" onClick={() => void remove()}>
            Удалить
          </Button>
        </div>
      )}
    </>
  )
}
