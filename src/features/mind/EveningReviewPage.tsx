import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router'
import { LinkButton, PageHeader, SectionHeader, Skeleton, StatTile, type IconName, type Tone } from '../../components/ui'
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
      {ready ? (
        <SummaryCard summary={data.summary} moods={data.moods.map((m) => ({ slot: m.slot, mood: m.mood }))} />
      ) : (
        <Skeleton className="mb-4 h-48" rounded="rounded-3xl" />
      )}
      {ready && <SectionHeader title="Осмыслить день" icon="moon" tone="violet" />}
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
  const items: { key: string; label: string; icon: IconName; tone: Tone; value: string; ok?: boolean }[] = [
    { key: 'Тренировка', label: 'Тренировка', icon: 'dumbbell', tone: 'accent', value: summary.workout ? '✓' : '✗', ok: summary.workout },
    { key: 'Кардио', label: 'Кардио', icon: 'run', tone: 'info', value: summary.cardioMin > 0 ? `${int(summary.cardioMin)} мин` : '—' },
    { key: 'Ккал', label: 'Ккал', icon: 'flame', tone: 'warn', value: summary.kcal > 0 ? int(summary.kcal) : '—' },
    { key: 'Вода', label: 'Вода', icon: 'droplet', tone: 'info', value: summary.waterMl > 0 ? `${int(summary.waterMl)} мл` : '—' },
    {
      key: 'Привычки',
      label: 'Привычки',
      icon: 'check',
      tone: 'pink',
      value: summary.habitsTotal > 0 ? `${summary.habitsDone}/${summary.habitsTotal}` : '—',
      ok: summary.habitsTotal > 0 && summary.habitsDone === summary.habitsTotal,
    },
    {
      key: 'Настроение',
      label: 'Настроение',
      icon: 'heart',
      tone: 'violet',
      value: [morning, evening].map((m) => (m ? MOOD_EMOJI[m.mood - 1] : '·')).join(' '),
    },
  ]
  return (
    <section aria-label="Итоги дня" className="mb-2">
      <SectionHeader title="Итоги дня" icon="chart" tone="violet" className="mt-0" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {items.map((it) => (
          <StatTile
            key={it.key}
            icon={it.icon}
            tone={it.tone}
            label={it.label}
            value={
              <span
                data-testid={`summary-${it.key}`}
                className={it.ok === true ? 'text-accent' : it.ok === false ? 'text-muted' : ''}
              >
                {it.value}
              </span>
            }
          />
        ))}
      </div>
      {!evening && (
        <LinkButton to="/mind/checkin?slot=evening" variant="secondary" size="sm" icon="moon" className="mt-3">
          Отметить вечернее настроение
        </LinkButton>
      )}
    </section>
  )
}
