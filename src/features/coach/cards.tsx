import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { Button, Card, IconBadge, LinkButton, StaggerList, TONE_SOFT } from '../../components/ui'
import { Icon } from '../../components/icons'
import { db } from '../../db'
import type { ISODate } from '../../db/types'
import { fromISODate, weekDates } from '../../lib/dates'
import { int, plural } from '../../lib/format'
import { collectWeekStats } from '../goals/stats'
import { useInsights } from './hooks'
import { dismissInsight, pickBrief, TARGET_PER_WEEK_KEY, DEFAULT_TARGET_PER_WEEK } from './insights'
import { ADVICE_ICON, ADVICE_TONE } from './meta'
import { weekNarrative } from './narrative'
import {
  adviceLabel,
  adviceNote,
  asKgRecord,
  asTmLog,
  MAXES_KEY,
  reviewSession,
  TRAINING_MAX_LOG_KEY,
  TRAINING_MAXES_KEY,
  type ExerciseReview,
  type LiftContext,
} from './progression'
import { InsightItem } from './parts'
import { addNoteToNextSession, getNextSessionNotes } from './tools'
import { DEFAULT_SLEEP_TARGET_MIN } from './summary'
import { fmtKg, shiftDate } from './util'

/* ------------------------------ MorningBriefCard ------------------------------ */

/** "Бриф дня" for the Today dashboard: 1–3 most important insights with actions. */
export function MorningBriefCard() {
  const insights = useInsights()
  if (insights === undefined) return null
  const brief = pickBrief(insights, 3)
  const rest = insights.length - brief.length
  return (
    <Card variant="elevated" tone="accent" aria-labelledby="coach-brief-title">
      <div className="mb-3 flex items-center gap-3">
        <IconBadge name="sparkles" tone="accent" />
        <div className="min-w-0 flex-1">
          <h2 id="coach-brief-title" className="text-[17px] leading-tight font-semibold tracking-tight">
            Бриф дня
          </h2>
          <p className="text-xs text-muted">
            {brief.length ? 'Тренер по твоим данным' : 'Новых советов нет'}
          </p>
        </div>
      </div>
      {brief.length === 0 ? (
        <p className="text-sm text-muted">Всё идёт по плану. Отмечай тренировки, еду и сон — и советы станут точнее.</p>
      ) : (
        <StaggerList className="flex flex-col gap-3.5" aria-label="Советы на сегодня">
          {brief.map((ins) => (
            <InsightItem key={ins.id} insight={ins} compact onDismiss={() => void dismissInsight(db, ins.id)} />
          ))}
        </StaggerList>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
        <span className="text-xs text-muted tabular-nums">
          {rest > 0 ? `Ещё ${rest} ${plural(rest, ['совет', 'совета', 'советов'])}` : ''}
        </span>
        <Link
          to="/coach"
          className="-mr-1 inline-flex min-h-8 items-center rounded-lg px-1 text-sm font-medium text-accent hover:underline"
        >
          Все советы
          <Icon name="chevron-right" size={16} />
        </Link>
      </div>
    </Card>
  )
}

/* ------------------------------ SessionReviewCard ------------------------------ */

function deltaLabel(cur: number, prev: number | null) {
  if (prev == null || prev <= 0) return null
  const pct = Math.round(((cur - prev) / prev) * 100)
  if (pct === 0) return { text: '±0 %', tone: 'text-muted' }
  return { text: `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`, tone: pct > 0 ? 'text-accent' : 'text-warn' }
}

function ReviewRow({ r }: { r: ExerciseReview }) {
  const delta = deltaLabel(r.volumeKg, r.prevVolumeKg)
  const a = r.advice
  return (
    <li className="rounded-2xl border border-white/[0.06] bg-surface-2/60 p-3" data-testid="review-row">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[15px] leading-snug font-semibold break-words">{r.name}</p>
        {r.isPR && (
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_SOFT.amber}`}>
            <Icon name="trophy" size={12} />
            Рекорд
          </span>
        )}
      </div>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
        <div className="min-w-0">
          <dt className="text-muted">Объём</dt>
          <dd className="font-medium">
            {int(r.volumeKg)} кг {delta && <span className={delta.tone}>{delta.text}</span>}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Лучший подход</dt>
          <dd className="font-medium break-words">
            {r.best ? `${fmtKg(r.best.weightKg)}×${r.best.reps}` : '—'}
            {r.prevBest && <span className="font-normal text-muted"> (было {fmtKg(r.prevBest.weightKg)}×{r.prevBest.reps})</span>}
          </dd>
        </div>
      </dl>
      {a && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${TONE_SOFT[ADVICE_TONE[a.action]]}`}>
            <Icon name={ADVICE_ICON[a.action]} size={13} />
            {adviceLabel(a)}
          </span>
          <span className="min-w-0 text-xs text-muted">{a.reason}</span>
        </div>
      )}
    </li>
  )
}

/**
 * Post-workout review: per exercise volume / best set vs last time, PR flag and the
 * next-time load (rule 1). "Сохранить подсказки" stores them via add_note_to_next_session.
 */
export function SessionReviewCard({ sessionId }: { sessionId: string }) {
  const data = useLiveQuery(async () => {
    const [session, all, notes, maxes, tms, tmLog] = await Promise.all([
      db.sessions.get(sessionId),
      db.sessions.toArray(),
      getNextSessionNotes(db),
      db.settings.get(MAXES_KEY),
      db.settings.get(TRAINING_MAXES_KEY),
      db.settings.get(TRAINING_MAX_LOG_KEY),
    ])
    const program = session?.programId ? await db.programs.get(session.programId) : undefined
    const lifts: LiftContext = {
      maxes: asKgRecord(maxes?.value),
      trainingMaxes: asKgRecord(tms?.value),
      tmLog: asTmLog(tmLog?.value),
      program,
    }
    return { session, all, notes, lifts }
  }, [sessionId])
  const [saving, setSaving] = useState(false)
  if (!data?.session) return null
  const reviews = reviewSession(data.session, data.all, data.lifts)
  if (reviews.length === 0) return null
  const advice = reviews.flatMap((r) => (r.advice ? [r.advice] : []))
  const saved = advice.length > 0 && advice.every((a) => data.notes[a.exerciseId]?.note === adviceNote(a))
  const prs = reviews.filter((r) => r.isPR).length

  async function save() {
    setSaving(true)
    try {
      for (const a of advice) await addNoteToNextSession(db, a.exerciseId, adviceNote(a))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card tone="accent" aria-labelledby="coach-review-title">
      <div className="mb-3 flex items-center gap-3">
        <IconBadge name="chart" tone="accent" />
        <div className="min-w-0 flex-1">
          <h2 id="coach-review-title" className="text-[17px] leading-tight font-semibold tracking-tight">
            Разбор тренировки
          </h2>
          <p className="text-xs text-muted">
            Сравнение с прошлым разом{prs ? ` · ${prs} ${plural(prs, ['рекорд', 'рекорда', 'рекордов'])}` : ''}
          </p>
        </div>
      </div>
      <StaggerList as="ul" className="flex flex-col gap-2">
        {reviews.map((r) => (
          <ReviewRow key={r.exerciseId} r={r} />
        ))}
      </StaggerList>
      {advice.length > 0 && (
        <Button
          variant={saved ? 'secondary' : 'primary'}
          className="mt-3 w-full"
          icon={saved ? 'check' : 'sparkles'}
          loading={saving}
          disabled={saved}
          onClick={() => void save()}
        >
          {saved ? 'Подсказки сохранены' : 'Сохранить подсказки'}
        </Button>
      )}
    </Card>
  )
}

/* ------------------------------ WeekNarrativeCard ------------------------------ */

/** 3–5 sentence summary of a week compared with the previous one (rules only). */
export function WeekNarrativeCard({ weekStart }: { weekStart: ISODate }) {
  const sentences = useLiveQuery(async () => {
    const start = weekDates(fromISODate(weekStart))[0]
    const prevStart = shiftDate(start, -7)
    const [stats, previous, profile, perWeek] = await Promise.all([
      collectWeekStats(db, start),
      collectWeekStats(db, prevStart),
      db.profile.get(1),
      db.settings.get(TARGET_PER_WEEK_KEY),
    ])
    return weekNarrative({
      stats,
      previous,
      goal: profile?.goal,
      sleepTargetMin: profile?.sleepTargetMin || DEFAULT_SLEEP_TARGET_MIN,
      targetPerWeek: typeof perWeek?.value === 'number' && perWeek.value > 0 ? perWeek.value : DEFAULT_TARGET_PER_WEEK,
    })
  }, [weekStart])
  if (!sentences) return null
  return (
    <Card tone="violet" aria-labelledby="coach-week-title">
      <div className="mb-2.5 flex items-center gap-3">
        <IconBadge name="sparkles" tone="violet" />
        <div className="min-w-0 flex-1">
          <h2 id="coach-week-title" className="text-[17px] leading-tight font-semibold tracking-tight">
            Неделя глазами тренера
          </h2>
          <p className="text-xs text-muted">По сравнению с прошлой неделей</p>
        </div>
      </div>
      <div className="space-y-1.5 text-sm leading-relaxed tabular-nums" data-testid="week-narrative">
        {sentences.map((s) => (
          <p key={s} className="break-words">
            {s}
          </p>
        ))}
      </div>
      <div className="mt-3">
        <LinkButton to="/coach" variant="secondary" size="sm" iconRight="chevron-right">
          Советы тренера
        </LinkButton>
      </div>
    </Card>
  )
}
