import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { LifeArea, LifeGoal } from '../../db/types'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Sheet,
  Stepper,
  Icon,
  TONE_SOFT,
  TONE_TEXT,
} from '../../components/ui'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import { GOAL_STATUS_RU, LIFE_AREAS } from './areas'
import { krProgress, krStart, krStep, type GoalKeyResult } from './calc'
import { LINK_PRIMARY, TEXTAREA_CLASS } from './styles'

type Status = LifeGoal['status']

interface KRDraft {
  id: string
  title: string
  unit: string
  start: string
  target: string
  current: number | null
}

const toDraft = (kr: GoalKeyResult): KRDraft => ({
  id: kr.id,
  title: kr.title,
  unit: kr.unit ?? '',
  start: String(krStart(kr)),
  target: String(kr.target),
  current: kr.current,
})

const emptyKR = (): KRDraft => ({
  id: newId(),
  title: '',
  unit: '',
  start: '0',
  target: '',
  current: 0,
})

const parseNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))

/** Draft as a key result for live progress / step calculation. */
const draftKr = (k: KRDraft): GoalKeyResult => ({
  id: k.id,
  title: k.title,
  unit: k.unit,
  current: k.current ?? 0,
  target: parseNum(k.target),
  start: parseNum(k.start) || 0,
})

/** Next 1 March from today — used by the "body" example. */
function nextMarchFirst(): string {
  const now = new Date()
  const year = now.getMonth() >= 2 ? now.getFullYear() + 1 : now.getFullYear()
  return `${year}-03-01`
}

const BODY_EXAMPLE: { title: string; krs: Omit<KRDraft, 'id'>[] } = {
  title: 'Вес 82 кг к 1 марта',
  krs: [
    { title: 'Вес', unit: 'кг', start: '88', target: '82', current: 88 },
    { title: 'Тренировок в неделю', unit: 'трен.', start: '0', target: '5', current: 0 },
    { title: 'Кардио в неделю', unit: 'мин', start: '0', target: '120', current: 0 },
  ],
}

export function GoalFormPage() {
  const { id } = useParams()
  // undefined = loading, null = not found
  const goal = useLiveQuery(async () => (id ? ((await db.lifeGoals.get(id)) ?? null) : null), [id])

  if (id && goal === undefined) return <PageHeader title="Цель" back="/goals" />
  if (id && goal === null) {
    return (
      <>
        <PageHeader title="Цель" back="/goals" />
        <EmptyState
          title="Цель не найдена"
          action={
            <Link to="/goals" className={LINK_PRIMARY}>
              К целям
            </Link>
          }
        />
      </>
    )
  }
  return <GoalForm key={id ?? 'new'} goal={goal ?? undefined} />
}

function GoalForm({ goal }: { goal?: LifeGoal }) {
  const navigate = useNavigate()
  const isNew = !goal
  const habits = useLiveQuery(
    () =>
      db.habits
        .orderBy('sort')
        .filter((h) => !h.archived)
        .toArray(),
    [],
  )

  const [area, setArea] = useState<LifeArea>(goal?.area ?? 'body')
  const [title, setTitle] = useState(goal?.title ?? '')
  const [why, setWhy] = useState(goal?.why ?? '')
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [status, setStatus] = useState<Status>(goal?.status ?? 'active')
  const [krs, setKrs] = useState<KRDraft[]>(goal ? goal.keyResults.map(toDraft) : [emptyKR()])
  const [habitIds, setHabitIds] = useState<string[]>(goal?.habitIds ?? [])
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const patchKr = (krId: string, patch: Partial<KRDraft>) =>
    setKrs((list) => list.map((k) => (k.id === krId ? { ...k, ...patch } : k)))

  function fillExample() {
    setTitle(BODY_EXAMPLE.title)
    setDeadline(nextMarchFirst())
    setKrs(BODY_EXAMPLE.krs.map((k) => ({ ...k, id: newId() })))
  }

  function toggleHabit(habitId: string) {
    setHabitIds((ids) =>
      ids.includes(habitId) ? ids.filter((x) => x !== habitId) : [...ids, habitId],
    )
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const name = title.trim()
    if (!name) return setError('Введите название цели')
    const keyResults: GoalKeyResult[] = []
    for (const k of krs) {
      const krTitle = k.title.trim()
      if (!krTitle) continue
      const target = parseNum(k.target)
      if (!Number.isFinite(target)) return setError(`Укажите цель для «${krTitle}»`)
      const startRaw = parseNum(k.start)
      const start = Number.isFinite(startRaw) ? startRaw : 0
      keyResults.push({
        id: k.id,
        title: krTitle,
        start,
        current: k.current ?? start,
        target,
        ...(k.unit.trim() ? { unit: k.unit.trim() } : {}),
      })
    }
    setError(null)

    const sort = goal?.sort ?? ((await db.lifeGoals.orderBy('sort').last())?.sort ?? -1) + 1
    const next: LifeGoal = {
      id: goal?.id ?? newId(),
      area,
      title: name,
      status,
      keyResults,
      habitIds,
      sort,
      createdAt: goal?.createdAt ?? new Date().toISOString(),
    }
    if (why.trim()) next.why = why.trim()
    if (deadline) next.deadline = deadline
    if (status === 'done') next.completedAt = goal?.completedAt ?? today()
    await db.lifeGoals.put(next)
    navigate('/goals')
  }

  async function remove() {
    if (!goal) return
    await db.lifeGoals.delete(goal.id)
    navigate('/goals')
  }

  return (
    <>
      <PageHeader title={isNew ? 'Новая цель' : 'Цель'} back="/goals" />
      <form onSubmit={save} className="space-y-4">
        <Card>
          <span className="mb-2 block text-xs font-medium tracking-wide text-muted uppercase">
            Сфера
          </span>
          <div
            className="grid grid-cols-4 gap-2 sm:grid-cols-7"
            role="radiogroup"
            aria-label="Сфера"
          >
            {LIFE_AREAS.map((a) => {
              const on = area === a.id
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setArea(a.id)}
                  className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 text-[11px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-95 motion-reduce:active:scale-100 ${
                    on ? `border-current ${TONE_SOFT[a.tone]}` : 'border-white/[0.05] bg-surface-2 text-muted hover:text-text'
                  }`}
                >
                  <Icon name={a.iconName} size={22} className={on ? '' : TONE_TEXT[a.tone]} />
                  <span className="w-full truncate text-center">{a.name}</span>
                </button>
              )
            })}
          </div>
          {isNew && area === 'body' && (
            <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
              <p className="text-muted">
                Пример: «Вес 82 кг к 1 марта»: KR вес 88→82, тренировок/нед 5, кардио мин/нед 120
              </p>
              <Button variant="ghost" size="sm" className="mt-1 -ml-3" onClick={fillExample}>
                Заполнить пример
              </Button>
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <Field label="Название">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Эстетичное тело"
              required
            />
          </Field>
          <Field label="Зачем">
            <textarea
              className={TEXTAREA_CLASS}
              rows={2}
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="Почему это важно для меня"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дедлайн">
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
            <Field label="Статус">
              <Select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {(Object.keys(GOAL_STATUS_RU) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {GOAL_STATUS_RU[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Ключевые результаты</h2>
            <Button variant="secondary" size="sm" onClick={() => setKrs((l) => [...l, emptyKR()])}>
              + KR
            </Button>
          </div>
          {krs.length === 0 && (
            <p className="text-sm text-muted">
              Добавьте измеримые результаты, чтобы видеть прогресс.
            </p>
          )}
          <ul className="space-y-3">
            {krs.map((k, i) => {
              const kr = draftKr(k)
              const pct = Number.isFinite(kr.target) ? Math.round(krProgress(kr)) : null
              const n = i + 1
              return (
                <li
                  key={k.id}
                  className="space-y-2 rounded-xl border border-border bg-surface-2/40 p-3"
                >
                  <div className="flex items-end gap-2">
                    <Field label={`KR ${n}`} className="flex-1">
                      <Input
                        aria-label={`Название KR ${n}`}
                        value={k.title}
                        onChange={(e) => patchKr(k.id, { title: e.target.value })}
                        placeholder="Вес"
                      />
                    </Field>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Удалить KR ${n}`}
                      className="mb-1"
                      onClick={() => setKrs((l) => l.filter((x) => x.id !== k.id))}
                    >
                      ✕
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Старт">
                      <Input
                        aria-label={`Старт KR ${n}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={k.start}
                        onChange={(e) => patchKr(k.id, { start: e.target.value })}
                      />
                    </Field>
                    <Field label="Цель">
                      <Input
                        aria-label={`Цель KR ${n}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={k.target}
                        onChange={(e) => patchKr(k.id, { target: e.target.value })}
                      />
                    </Field>
                    <Field label="Единица">
                      <Input
                        aria-label={`Единица KR ${n}`}
                        value={k.unit}
                        onChange={(e) => patchKr(k.id, { unit: e.target.value })}
                        placeholder="кг"
                      />
                    </Field>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium tracking-wide text-muted uppercase">
                      Текущее
                    </span>
                    <div className="flex items-center gap-3">
                      {pct != null && (
                        <span className="text-sm text-muted tabular-nums">{pct}%</span>
                      )}
                      <Stepper
                        aria-label={`Текущее KR ${n}`}
                        value={k.current}
                        step={krStep(kr)}
                        onChange={(v) => patchKr(k.id, { current: v })}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Связанные привычки</h2>
          {habits && habits.length === 0 ? (
            <p className="text-sm text-muted">
              Привычек пока нет.{' '}
              <Link to="/habits/new" className="text-accent">
                Создать привычку
              </Link>
            </p>
          ) : (
            <ul className="space-y-1">
              {habits?.map((h) => (
                <li key={h.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[var(--color-accent)]"
                      checked={habitIds.includes(h.id)}
                      onChange={() => toggleHabit(h.id)}
                    />
                    <span aria-hidden>{h.icon}</span>
                    <span>{h.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" size="lg" className="sm:flex-1">
            {isNew ? 'Создать цель' : 'Сохранить'}
          </Button>
          {!isNew && (
            <Button variant="danger" size="lg" onClick={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          )}
        </div>
      </form>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Удалить цель?">
        <p className="mb-4 text-sm text-muted">
          Цель «{goal?.title}» и её ключевые результаты будут удалены.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>
            Отмена
          </Button>
          <Button variant="danger" className="flex-1" onClick={() => void remove()}>
            Удалить навсегда
          </Button>
        </div>
      </Sheet>
    </>
  )
}
