import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Card, PageHeader } from '../../components/ui'
import { db } from '../../db'
import type { ISODate } from '../../db/types'
import { today } from '../../lib/dates'
import { int } from '../../lib/format'
import { daySummary, MOOD_EMOJI, shiftDate, type DaySummary } from './calc'
import { JournalForm } from './JournalForm'

async function loadDay(date: ISODate) {
  // Sessions are indexed by an ISO timestamp; a margin covers time-zone shifts.
  const since = `${shiftDate(date, -2)}T00:00:00`
  const [sessions, activities, foodEntries, water, habits, habitLogs, moods, review] = await Promise.all([
    db.sessions.where('startedAt').aboveOrEqual(since).toArray(),
    db.activities.where('date').equals(date).toArray(),
    db.foodEntries.where('date').equals(date).toArray(),
    db.water.where('date').equals(date).toArray(),
    db.habits.toArray(),
    db.habitLogs.where('date').equals(date).toArray(),
    db.moods.where('date').equals(date).toArray(),
    db.journal.where('date').equals(date).filter((e) => e.kind === 'evening_review').first(),
  ])
  return {
    date,
    summary: daySummary({ sessions, activities, foodEntries, water, habits, habitLogs }, date),
    moods,
    review: review ?? null,
  }
}

/** Evening review (wins / improve / tomorrow) next to an automatic summary of the day. */
export function EveningReviewPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const dateParam = params.get('date')
  const date: ISODate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today()
  const data = useLiveQuery(() => loadDay(date), [date])
  const ready = data && data.date === date

  return (
    <>
      <PageHeader title="Вечерний обзор" subtitle={date === today() ? 'Сегодня' : date} back="/mind" />
      {ready && <SummaryCard summary={data.summary} moods={data.moods.map((m) => ({ slot: m.slot, mood: m.mood }))} />}
      {ready && (
        <JournalForm
          key={`${date}-${data.review?.id ?? 'new'}`}
          kind="evening_review"
          entry={data.review ?? undefined}
          fixedDate={date}
          submitLabel={data.review ? 'Сохранить изменения' : 'Сохранить обзор'}
          onSaved={() => navigate('/mind/journal?kind=evening_review')}
        />
      )}
    </>
  )
}

function SummaryCard({ summary, moods }: { summary: DaySummary; moods: { slot: string; mood: number }[] }) {
  const morning = moods.find((m) => m.slot === 'morning')
  const evening = moods.find((m) => m.slot === 'evening')
  const items: { label: string; value: string; ok?: boolean }[] = [
    {
      label: 'Тренировка',
      value: summary.workout ? '✓' : '✗',
      ok: summary.workout,
    },
    { label: 'Кардио', value: summary.cardioMin > 0 ? `${int(summary.cardioMin)} мин` : '—' },
    { label: 'Ккал', value: summary.kcal > 0 ? int(summary.kcal) : '—' },
    { label: 'Вода', value: summary.waterMl > 0 ? `${int(summary.waterMl)} мл` : '—' },
    {
      label: 'Привычки',
      value: summary.habitsTotal > 0 ? `${summary.habitsDone}/${summary.habitsTotal}` : '—',
      ok: summary.habitsTotal > 0 && summary.habitsDone === summary.habitsTotal,
    },
    {
      label: 'Настроение',
      value: [morning, evening].map((m) => (m ? MOOD_EMOJI[m.mood - 1] : '·')).join(' '),
    },
  ]
  return (
    <Card className="mb-4">
      <h2 className="mb-2 text-sm font-medium text-muted">Итоги дня</h2>
      <dl className="grid grid-cols-3 gap-2" aria-label="Итоги дня">
        {items.map((it) => (
          <div key={it.label} className="rounded-xl bg-surface-2 px-2 py-2 text-center">
            <dt className="text-[11px] text-muted">{it.label}</dt>
            <dd
              data-testid={`summary-${it.label}`}
              className={`mt-0.5 text-base font-semibold tabular-nums ${it.ok === true ? 'text-accent' : it.ok === false ? 'text-muted' : ''}`}
            >
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
      {!evening && (
        <Link to="/mind/checkin?slot=evening" className="mt-3 inline-block text-sm text-accent">
          Отметить вечернее настроение →
        </Link>
      )}
    </Card>
  )
}
