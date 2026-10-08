import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { ISODate, LifeGoal, WeeklyReview } from '../../db/types'
import { motion } from 'motion/react'
import {
  Button,
  Card,
  Field,
  Icon,
  IconBadge,
  Input,
  PageHeader,
  Progress,
  SectionHeader,
  Skeleton,
  Stepper,
  type IconName,
  type Tone,
} from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import { areaMeta } from './areas'
import {
  cleanLines,
  krProgress,
  krStep,
  padLines,
  reviewTargetWeek,
  shiftWeek,
  weekLabel,
  weekStartOf,
} from './calc'
import { RatingInput, StatGrid, Stars } from './components'
import { useCurrencySign, useReviews, useWeekStats } from './hooks'
import { collectWeekStats } from './stats'
import { WeekNarrativeCard } from '../coach/cards'
import { staggerItem } from './styles'

const STEPS = ['Цифры недели', 'Итоги', 'Ключевые результаты'] as const
const STEP_SHORT = ['Цифры', 'Итоги', 'KR'] as const
const SPRING = { type: 'spring', stiffness: 300, damping: 26 } as const
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
  const [currentWeek] = useState(() => weekStartOf(new Date()))
  const goTo = (w: ISODate) => navigate(`/goals/review?week=${w}`)
  const reduce = useReduceMotion()
  const arrowBtn =
    'grid size-10 shrink-0 place-items-center rounded-full text-muted transition-[background-color,color,transform] hover:bg-surface-3 hover:text-text active:scale-90 disabled:pointer-events-none disabled:opacity-30 motion-reduce:active:scale-100'

  return (
    <>
      <PageHeader title="Обзор недели" subtitle="Подведите итоги и обновите цели" back="/goals" />

      <div className="mb-4 flex items-center justify-between gap-2 rounded-full border border-white/[0.06] bg-surface-2/80 p-1">
        <button
          type="button"
          className={arrowBtn}
          aria-label="Предыдущая неделя"
          onClick={() => goTo(shiftWeek(week, -1))}
        >
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="min-w-0 text-center">
          <div className="font-semibold tracking-tight tabular-nums" data-testid="review-week">
            {weekLabel(week)}
          </div>
          {existing && (
            <div className="truncate text-[11px] text-accent">Обзор сохранён — можно отредактировать</div>
          )}
        </div>
        <button
          type="button"
          className={arrowBtn}
          aria-label="Следующая неделя"
          disabled={week >= currentWeek}
          onClick={() => goTo(shiftWeek(week, 1))}
        >
          <Icon name="chevron-right" size={20} />
        </button>
      </div>

      {existing === undefined || goals === undefined ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-14" rounded="rounded-2xl" />
          <Skeleton className="h-64" rounded="rounded-3xl" />
        </div>
      ) : (
        <ReviewWizard
          key={`${week}:${existing?.id ?? 'new'}`}
          week={week}
          existing={existing}
          goals={goals}
        />
      )}

      {reviews && reviews.length > 0 && (
        <section aria-label="Архив обзоров">
          <SectionHeader title="Прошлые обзоры" icon="history" tone="amber" className="mt-8" />
          <ul className="space-y-2" aria-label="Прошлые обзоры">
            {reviews.map((r, i) => (
              <motion.li key={r.id} {...staggerItem(i, reduce)}>
                <Link
                  to={`/goals/review/${r.weekStart}`}
                  className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/[0.06] bg-surface px-3 py-2 text-sm transition-[border-color,transform] duration-150 hover:border-white/15 active:scale-[0.99] motion-reduce:active:scale-100"
                >
                  <IconBadge name="calendar" tone="amber" size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium tabular-nums">{weekLabel(r.weekStart)}</span>
                    {r.nextFocus.length > 0 && (
                      <span className="block truncate text-xs text-muted">Фокус: {r.nextFocus.join(' · ')}</span>
                    )}
                  </span>
                  <Stars value={r.rating} size={13} />
                  <Icon name="chevron-right" size={16} className="text-muted" />
                </Link>
              </motion.li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function ReviewWizard({
  week,
  existing,
  goals,
}: {
  week: ISODate
  existing: WeeklyReview | null
  goals: LifeGoal[]
}) {
  const navigate = useNavigate()
  const stats = useWeekStats(week)
  const prevStats = useWeekStats(shiftWeek(week, -1))
  const currency = useCurrencySign()

  const reduce = useReduceMotion()
  const [step, setStep] = useState(0)
  const [wins, setWins] = useState(() => padLines(existing?.wins))
  const [improve, setImprove] = useState(() => padLines(existing?.improve))
  const [focus, setFocus] = useState(() => padLines(existing?.nextFocus))
  const [rating, setRating] = useState<Rating | undefined>(existing?.rating)
  /** goalId → krId → edited current value */
  const [krEdits, setKrEdits] = useState<Record<string, Record<string, number>>>({})
  const [saving, setSaving] = useState(false)

  const krValue = (goalId: string, krId: string, fallback: number) =>
    krEdits[goalId]?.[krId] ?? fallback
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
          keyResults: goal.keyResults.map((kr) =>
            kr.id in edits ? { ...kr, current: edits[kr.id] } : kr,
          ),
        })
      }
    })
    navigate(`/goals/review/${week}`)
  }

  return (
    <div className="space-y-4">
      <ol
        className="flex gap-1 rounded-2xl border border-white/[0.05] bg-surface-2/80 p-1"
        aria-label="Шаги обзора"
      >
        {STEPS.map((label, i) => {
          const active = i === step
          const done = i < step
          return (
            <li key={label} aria-current={active ? 'step' : undefined} className="relative flex-1">
              {active &&
                (reduce ? (
                  <span aria-hidden className="absolute inset-0 rounded-xl bg-surface-3" />
                ) : (
                  <motion.span
                    aria-hidden
                    layoutId="review-step-pill"
                    transition={SPRING}
                    className="absolute inset-0 rounded-xl bg-surface-3 shadow-[0_2px_8px_-2px_rgb(0_0_0/0.5)]"
                  />
                ))}
              <span
                className={`relative flex min-h-10 items-center justify-center gap-1.5 px-1 text-xs font-medium ${
                  active ? 'text-text' : 'text-muted'
                }`}
              >
                <span
                  aria-hidden
                  className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums transition-colors duration-200 ${
                    done || active ? 'bg-accent text-bg' : 'bg-surface-3 text-muted'
                  }`}
                >
                  {done ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}
                </span>
                <span className="truncate">{STEP_SHORT[i]}</span>
              </span>
            </li>
          )
        })}
      </ol>
      <h2 className="text-lg font-semibold tracking-tight">
        Шаг {step + 1} из 3 · {STEPS[step]}
      </h2>

      <motion.div
        key={step}
        className="space-y-3"
        initial={reduce ? false : { opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
      >
      {step === 0 &&
        (stats ? (
          <div className="space-y-3">
            <WeekNarrativeCard weekStart={week} />
            <StatGrid current={stats} previous={prevStats} currency={currency} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" rounded="rounded-3xl" />
            ))}
          </div>
        ))}

      {step === 1 && (
        <div className="space-y-3">
          <LinesCard
            icon="trophy"
            tone="accent"
            title="Победы"
            label="Победа"
            lines={wins}
            onChange={setWins}
            placeholder="Что получилось"
          />
          <LinesCard
            icon="activity"
            tone="warn"
            title="Улучшить"
            label="Улучшить"
            lines={improve}
            onChange={setImprove}
            placeholder="Что можно сделать лучше"
          />
          <LinesCard
            icon="target"
            tone="info"
            title="Фокус на следующую неделю"
            label="Фокус"
            lines={focus}
            onChange={setFocus}
            placeholder="Главный приоритет"
          />
          <Card tone="amber">
            <h3 className="mb-2 flex items-center gap-2 font-semibold tracking-tight">
              <IconBadge name="star" tone="amber" size="sm" />
              Оценка недели
            </h3>
            <RatingInput value={rating} onChange={setRating} />
          </Card>
        </div>
      )}

      {step === 2 &&
        (goals.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              Активных целей нет.{' '}
              <Link to="/goals/new" className="font-medium text-accent">
                Поставить цель
              </Link>
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {goals.map((g) => {
              const area = areaMeta(g.area)
              return (
                <Card key={g.id} tone={area.tone}>
                  <h3 className="mb-3 flex items-center gap-2.5 font-semibold tracking-tight">
                    <IconBadge name={area.iconName} tone={area.tone} size="sm" />
                    <span className="min-w-0 truncate">{g.title}</span>
                  </h3>
                  {g.keyResults.length === 0 && (
                    <p className="text-sm text-muted">Нет ключевых результатов.</p>
                  )}
                  <ul className="space-y-4">
                    {g.keyResults.map((kr) => {
                      const current = krValue(g.id, kr.id, kr.current)
                      const pct = Math.round(krProgress({ ...kr, current }))
                      return (
                        <li key={kr.id}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{kr.title}</div>
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
                          </div>
                          <Progress value={pct / 100} tone={area.tone} className="mt-2 h-1.5" />
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              )
            })}
          </div>
        ))}
      </motion.div>

      <div className="flex gap-2">
        {step > 0 && (
          <Button
            variant="secondary"
            size="lg"
            icon="chevron-left"
            className="flex-1"
            onClick={() => setStep((s) => s - 1)}
          >
            Назад
          </Button>
        )}
        {step < 2 ? (
          <Button size="lg" iconRight="chevron-right" className="flex-1" onClick={() => setStep((s) => s + 1)}>
            Далее
          </Button>
        ) : (
          <Button size="lg" icon="check" className="flex-1" loading={saving} onClick={() => void save()}>
            Сохранить обзор
          </Button>
        )}
      </div>
      {existing && (
        <p className="text-center text-xs text-muted">
          Сохранённый обзор:{' '}
          <Link to={`/goals/review/${week}`} className="font-medium text-accent">
            открыть
          </Link>
        </p>
      )}
    </div>
  )
}

function LinesCard({
  icon,
  tone,
  title,
  label,
  lines,
  onChange,
  placeholder,
}: {
  icon: IconName
  tone: Tone
  title: string
  label: string
  lines: string[]
  onChange: (lines: string[]) => void
  placeholder: string
}) {
  return (
    <Card tone={tone}>
      <h3 className="mb-3 flex items-center gap-2 font-semibold tracking-tight">
        <IconBadge name={icon} tone={tone} size="sm" />
        {title}
      </h3>
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
