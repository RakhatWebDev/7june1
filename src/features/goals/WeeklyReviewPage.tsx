import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { ISODate, LifeGoal, WeeklyReview } from '../../db/types'
import { Button, Card, Field, Input, PageHeader, Stepper } from '../../components/ui'
import { areaMeta } from './areas'
import { cleanLines, krProgress, krStep, padLines, reviewTargetWeek, shiftWeek, weekLabel, weekStartOf } from './calc'
import { RatingInput, StatGrid, Stars } from './components'
import { useCurrencySign, useReviews, useWeekStats } from './hooks'
import { collectWeekStats } from './stats'
import { LINK_PRIMARY } from './styles'

const STEPS = ['Цифры недели', 'Итоги', 'Ключевые результаты'] as const
type Rating = 1 | 2 | 3 | 4 | 5

/** Normalised Monday of `?week=` or the default week to review. */
function useReviewWeek(): ISODate {
  const [params] = useSearchParams()
  const raw = params.get('week')
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? weekStartOf(raw) : reviewTargetWeek()
}

export function WeeklyReviewPage() {
  const week = useReviewWeek()
  const navigate = useNavigate()
  const existing = useLiveQuery(
    async () => (await db.weeklyReviews.where('weekStart').equals(week).first()) ?? null,
    [week],
  )
  const goals = useLiveQuery(() => db.lifeGoals.where('status').equals('active').sortBy('sort'), [])
  const reviews = useReviews()
  const currentWeek = weekStartOf(new Date())
  const goTo = (w: ISODate) => navigate(`/goals/review?week=${w}`)

  return (
    <>
      <PageHeader title="Обзор недели" subtitle="Подведите итоги и обновите цели" back="/goals" />

      <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-2 py-1">
        <Button variant="ghost" aria-label="Предыдущая неделя" onClick={() => goTo(shiftWeek(week, -1))}>
          ←
        </Button>
        <div className="text-center">
          <div className="font-semibold tabular-nums" data-testid="review-week">
            {weekLabel(week)}
          </div>
          {existing && <div className="text-xs text-accent">Обзор сохранён — можно отредактировать</div>}
        </div>
        <Button
          variant="ghost"
          aria-label="Следующая неделя"
          disabled={week >= currentWeek}
          onClick={() => goTo(shiftWeek(week, 1))}
        >
          →
        </Button>
      </div>

      {existing === undefined || goals === undefined ? (
        <p className="text-sm text-muted">Загрузка…</p>
      ) : (
        <ReviewWizard key={`${week}:${existing?.id ?? 'new'}`} week={week} existing={existing} goals={goals} />
      )}

      {reviews && reviews.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-2 font-semibold">Прошлые обзоры</h2>
          <ul className="divide-y divide-border" aria-label="Прошлые обзоры">
            {reviews.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/goals/review/${r.weekStart}`}
                  className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:text-accent"
                >
                  <span className="tabular-nums">{weekLabel(r.weekStart)}</span>
                  <Stars value={r.rating} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function ReviewWizard({ week, existing, goals }: { week: ISODate; existing: WeeklyReview | null; goals: LifeGoal[] }) {
  const navigate = useNavigate()
  const stats = useWeekStats(week)
  const prevStats = useWeekStats(shiftWeek(week, -1))
  const currency = useCurrencySign()

  const [step, setStep] = useState(0)
  const [wins, setWins] = useState(() => padLines(existing?.wins))
  const [improve, setImprove] = useState(() => padLines(existing?.improve))
  const [focus, setFocus] = useState(() => padLines(existing?.nextFocus))
  const [rating, setRating] = useState<Rating | undefined>(existing?.rating)
  /** goalId → krId → edited current value */
  const [krEdits, setKrEdits] = useState<Record<string, Record<string, number>>>({})
  const [saving, setSaving] = useState(false)

  const krValue = (goalId: string, krId: string, fallback: number) => krEdits[goalId]?.[krId] ?? fallback
  const setKrValue = (goalId: string, krId: string, v: number) =>
    setKrEdits((all) => ({ ...all, [goalId]: { ...all[goalId], [krId]: v } }))

  async function save() {
    setSaving(true)
    const snapshot = await collectWeekStats(db, week)
    await db.transaction('rw', db.weeklyReviews, db.lifeGoals, async () => {
      const review: WeeklyReview = {
        id: existing?.id ?? `review-${week}`,
        weekStart: week,
        stats: snapshot,
        wins: cleanLines(wins),
        improve: cleanLines(improve),
        nextFocus: cleanLines(focus),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }
      if (rating) review.rating = rating
      await db.weeklyReviews.put(review)
      for (const [goalId, edits] of Object.entries(krEdits)) {
        const goal = await db.lifeGoals.get(goalId)
        if (!goal) continue
        await db.lifeGoals.update(goalId, {
          keyResults: goal.keyResults.map((kr) => (kr.id in edits ? { ...kr, current: edits[kr.id] } : kr)),
        })
      }
    })
    navigate(`/goals/review/${week}`)
  }

  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-3 gap-2" aria-label="Шаги обзора">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined}>
            <div className={`h-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-surface-2'}`} />
            <div className={`mt-1 text-[11px] ${i === step ? 'text-text' : 'text-muted'}`}>{s}</div>
          </li>
        ))}
      </ol>
      <h2 className="text-lg font-semibold">
        Шаг {step + 1} из 3 · {STEPS[step]}
      </h2>

      {step === 0 &&
        (stats ? (
          <StatGrid current={stats} previous={prevStats} currency={currency} />
        ) : (
          <p className="text-sm text-muted">Считаем…</p>
        ))}

      {step === 1 && (
        <div className="space-y-4">
          <LinesCard title="Победы" label="Победа" lines={wins} onChange={setWins} placeholder="Что получилось" />
          <LinesCard title="Улучшить" label="Улучшить" lines={improve} onChange={setImprove} placeholder="Что можно сделать лучше" />
          <LinesCard
            title="Фокус на следующую неделю"
            label="Фокус"
            lines={focus}
            onChange={setFocus}
            placeholder="Главный приоритет"
          />
          <Card>
            <h3 className="mb-2 font-semibold">Оценка недели</h3>
            <RatingInput value={rating} onChange={setRating} />
          </Card>
        </div>
      )}

      {step === 2 &&
        (goals.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              Активных целей нет.{' '}
              <Link to="/goals/new" className="text-accent">
                Поставить цель
              </Link>
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {goals.map((g) => (
              <Card key={g.id}>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <span aria-hidden>{areaMeta(g.area).icon}</span>
                  {g.title}
                </h3>
                {g.keyResults.length === 0 && <p className="text-sm text-muted">Нет ключевых результатов.</p>}
                <ul className="space-y-3">
                  {g.keyResults.map((kr) => {
                    const current = krValue(g.id, kr.id, kr.current)
                    const pct = Math.round(krProgress({ ...kr, current }))
                    return (
                      <li key={kr.id} className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm">{kr.title}</div>
                          <div className="text-xs text-muted tabular-nums">
                            цель {kr.target}
                            {kr.unit ? ` ${kr.unit}` : ''} · {pct}%
                          </div>
                        </div>
                        <Stepper
                          aria-label={`${kr.title}: текущее`}
                          value={current}
                          step={krStep(kr)}
                          suffix={kr.unit}
                          onChange={(v) => setKrValue(g.id, kr.id, v ?? 0)}
                        />
                      </li>
                    )
                  })}
                </ul>
              </Card>
            ))}
          </div>
        ))}

      <div className="flex gap-2">
        {step > 0 && (
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep((s) => s - 1)}>
            Назад
          </Button>
        )}
        {step < 2 ? (
          <Button size="lg" className="flex-1" onClick={() => setStep((s) => s + 1)}>
            Далее
          </Button>
        ) : (
          <Button size="lg" className="flex-1" disabled={saving} onClick={() => void save()}>
            Сохранить обзор
          </Button>
        )}
      </div>
      {existing && (
        <p className="text-center text-xs text-muted">
          <Link to={`/goals/review/${week}`} className={`${LINK_PRIMARY} hidden`} />
          Сохранённый обзор:{' '}
          <Link to={`/goals/review/${week}`} className="text-accent">
            открыть
          </Link>
        </p>
      )}
    </div>
  )
}

function LinesCard({
  title,
  label,
  lines,
  onChange,
  placeholder,
}: {
  title: string
  label: string
  lines: string[]
  onChange: (lines: string[]) => void
  placeholder: string
}) {
  return (
    <Card>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <div className="space-y-2">
        {lines.map((line, i) => (
          <Field key={i} label={`${label} ${i + 1}`} className="[&>span]:sr-only">
            <Input
              value={line}
              placeholder={i === 0 ? placeholder : undefined}
              onChange={(e) => onChange(lines.map((l, j) => (j === i ? e.target.value : l)))}
            />
          </Field>
        ))}
      </div>
    </Card>
  )
}
