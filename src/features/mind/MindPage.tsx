import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db'
import type { ISODate, MoodEntry } from '../../db/types'
import { today, weekDates } from '../../lib/dates'
import { plural } from '../../lib/format'
import {
  averageMood,
  ddmm,
  gratitudeStreak,
  insightText,
  MIND_KIND_ICON,
  MIND_KIND_LABEL,
  MOOD_EMOJI,
  MOOD_LABEL,
  moodSeries,
  practiceMinutes,
  shiftDate,
  SLOT_LABEL,
  tagInsights,
  type Slot,
} from './calc'
import { MoodChart } from './MoodChart'

async function loadHub(ref: ISODate) {
  const week = weekDates()
  const [moods, gratitude, weekSessions, recent] = await Promise.all([
    db.moods.where('date').aboveOrEqual(shiftDate(ref, -29)).toArray(),
    db.journal.where('kind').equals('gratitude').toArray(),
    db.mindSessions.where('date').between(week[0], week[6], true, true).toArray(),
    db.mindSessions.orderBy('date').reverse().limit(5).toArray(),
  ])
  return { ref, moods, gratitude, weekSessions, week, recent }
}

const ACTIONS: { to: string; icon: string; label: string }[] = [
  { to: '/mind/meditate', icon: '🧘', label: 'Медитация' },
  { to: '/mind/breathe', icon: '🌬️', label: 'Дыхание' },
  { to: '/mind/meditate?kind=prayer', icon: '🕯️', label: 'Молитва / чтение' },
  { to: '/mind/journal/new?kind=gratitude', icon: '💛', label: 'Благодарность' },
  { to: '/mind/journal', icon: '📓', label: 'Дневник' },
  { to: '/mind/review', icon: '🌙', label: 'Вечерний обзор' },
]

/** Mind & spirit hub: today's check-ins, practice, gratitude streak, 30-day mood and tag insights. */
export function MindPage() {
  const ref = today()
  const data = useLiveQuery(() => loadHub(ref), [ref])

  const moods = data?.moods ?? []
  const series = moodSeries(moods, ref, 30)
  const insights = tagInsights(moods, ref, 30).slice(0, 4)
  const streak = gratitudeStreak(data?.gratitude ?? [], ref)
  const weekMin = data ? practiceMinutes(data.weekSessions, data.week[0], data.week[6]) : 0
  const avg = averageMood(moods, ref, 30)
  const hasMood = series.some((p) => p.mood != null)

  return (
    <>
      <PageHeader title="Разум и дух" subtitle="Настроение, практика, дневник" back="/growth" />

      <section aria-label="Чек-ины сегодня" className="mb-4 grid grid-cols-2 gap-2">
        {(['morning', 'evening'] as const).map((slot) => (
          <CheckinTile key={slot} slot={slot} entry={moods.find((m) => m.date === ref && m.slot === slot)} />
        ))}
      </section>

      <section aria-label="Сводка" className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Практика за неделю" value={`${weekMin} мин`} />
        <Stat
          label="Благодарность"
          value={
            <span data-testid="gratitude-streak">
              {streak > 0 && <span aria-hidden>🔥 </span>}
              {streak}
            </span>
          }
          sub={plural(streak, ['день подряд', 'дня подряд', 'дней подряд'])}
        />
        <Stat label="Настроение 30 дн." value={avg != null ? avg.toFixed(1) : '—'} sub={avg != null ? MOOD_EMOJI[Math.round(avg) - 1] : undefined} />
      </section>

      <nav aria-label="Практики" className="mb-4 grid grid-cols-3 gap-2">
        {ACTIONS.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface px-2 py-3 text-center text-xs transition hover:border-accent/50"
          >
            <span className="text-2xl" aria-hidden>
              {a.icon}
            </span>
            {a.label}
          </Link>
        ))}
      </nav>

      <Card className="mb-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-muted">Настроение за 30 дней</h2>
          <div className="flex gap-3 text-[11px] text-muted" aria-hidden>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-accent" /> настроение
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-info" /> энергия
            </span>
          </div>
        </div>
        {hasMood ? (
          <MoodChart data={series} />
        ) : (
          <p className="py-6 text-center text-sm text-muted">Сделайте первый чек-ин — здесь появится график.</p>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-medium text-muted">Инсайты</h2>
        {insights.length === 0 ? (
          <p className="text-sm text-muted">
            Отмечайте теги в чек-инах — через несколько дней здесь появится, что поднимает вам настроение.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Инсайты по тегам">
            {insights.map((i) => (
              <li key={i.tag} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 shrink-0 rounded-lg px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                    i.delta > 0 ? 'bg-accent/15 text-accent' : i.delta < 0 ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-muted'
                  }`}
                >
                  {i.delta > 0 ? '↑' : i.delta < 0 ? '↓' : '='} {Math.abs(i.delta).toFixed(1)}
                </span>
                <span className="text-sm">
                  {insightText(i)}
                  <span className="text-muted">
                    {' '}
                    · {i.withCount} {plural(i.withCount, ['отметка', 'отметки', 'отметок'])}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-2 text-sm font-medium text-muted">Последние практики</h2>
      {data && data.recent.length === 0 ? (
        <EmptyState title="Практик пока нет" hint="Начните с 5 минут тишины или пары циклов дыхания." />
      ) : (
        <ul className="space-y-2">
          {(data?.recent ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              <span className="text-xl" aria-hidden>
                {MIND_KIND_ICON[s.kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{MIND_KIND_LABEL[s.kind]}</span>
                {s.note && <span className="block truncate text-xs text-muted">{s.note}</span>}
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                {s.durationMin} мин
                <span className="block text-xs text-muted">{ddmm(s.date)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function CheckinTile({ slot, entry }: { slot: Slot; entry?: MoodEntry }) {
  return (
    <Link
      to={`/mind/checkin?slot=${slot}`}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition hover:border-accent/50"
    >
      <span className="text-3xl" aria-hidden>
        {entry ? MOOD_EMOJI[entry.mood - 1] : slot === 'morning' ? '☀️' : '🌙'}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted">{SLOT_LABEL[slot]}</span>
        <span className="block truncate text-sm font-medium">{entry ? MOOD_LABEL[entry.mood - 1] : 'Отметить'}</span>
      </span>
    </Link>
  )
}
