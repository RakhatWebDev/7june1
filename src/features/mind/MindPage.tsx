import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import {
  Card,
  CountUp,
  EmptyState,
  Icon,
  IconBadge,
  LinkButton,
  PageHeader,
  SectionHeader,
  StatTile,
  type IconName,
  type Tone,
} from '../../components/ui'
import { toneTint, useReduceMotion } from '../../components/ui/helpers'
import { db } from '../../db'
import type { ISODate, MoodEntry } from '../../db/types'
import { today, weekDates } from '../../lib/dates'
import { plural } from '../../lib/format'
import {
  averageMood,
  ddmm,
  gratitudeStreak,
  insightText,
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
import { MIND_KIND_BADGE, staggerItem } from './styles'

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

const ACTIONS: { to: string; icon: IconName; tone: Tone; label: string }[] = [
  { to: '/mind/meditate', icon: 'brain', tone: 'violet', label: 'Медитация' },
  { to: '/mind/breathe', icon: 'wind', tone: 'info', label: 'Дыхание' },
  { to: '/mind/meditate?kind=prayer', icon: 'sparkles', tone: 'amber', label: 'Молитва / чтение' },
  { to: '/mind/journal/new?kind=gratitude', icon: 'heart', tone: 'pink', label: 'Благодарность' },
  { to: '/mind/journal', icon: 'book', tone: 'warn', label: 'Дневник' },
  { to: '/mind/review', icon: 'moon', tone: 'violet', label: 'Вечерний обзор' },
]

/** Mind & spirit hub: today's check-ins, practice, gratitude streak, 30-day mood and tag insights. */
export function MindPage() {
  const ref = today()
  const data = useLiveQuery(() => loadHub(ref), [ref])
  const reduce = useReduceMotion()

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

      <section aria-label="Чек-ины сегодня" className="mb-3 grid grid-cols-2 gap-3">
        {(['morning', 'evening'] as const).map((slot) => (
          <CheckinTile key={slot} slot={slot} entry={moods.find((m) => m.date === ref && m.slot === slot)} />
        ))}
      </section>

      <section aria-label="Сводка" className="mb-3 grid grid-cols-2 gap-3">
        <StatTile
          icon="brain"
          tone="violet"
          label="Практика"
          data-testid="practice-week"
          value={<CountUp value={weekMin} />}
          unit="мин"
          sub="за эту неделю"
        />
        <StatTile
          icon="heart"
          tone="pink"
          label="Благодарность"
          value={
            <span data-testid="gratitude-streak" className="flex items-center gap-1">
              {streak > 0 && <Icon name="flame" size={18} className="text-amber" />}
              {streak}
            </span>
          }
          sub={plural(streak, ['день подряд', 'дня подряд', 'дней подряд'])}
        />
      </section>

      <nav aria-label="Практики" className="grid grid-cols-3 gap-2">
        {ACTIONS.map((a, i) => (
          <motion.div key={a.to} {...staggerItem(i, reduce)}>
            <Link
              to={a.to}
              className="flex h-full min-h-[92px] flex-col items-center justify-center gap-2 rounded-3xl border border-white/[0.06] bg-surface bg-[image:var(--gradient-surface)] px-1.5 py-3 text-center text-[12px] leading-tight font-medium shadow-[var(--shadow-card)] transition-[border-color,transform] duration-150 hover:border-white/15 active:scale-[0.97] motion-reduce:active:scale-100"
            >
              <IconBadge name={a.icon} tone={a.tone} />
              {a.label}
            </Link>
          </motion.div>
        ))}
      </nav>

      <SectionHeader
        title="Настроение за 30 дней"
        icon="activity"
        tone="violet"
        action={
          avg != null ? (
            <span className="flex items-center gap-1.5 text-sm text-muted" aria-label={`Среднее настроение ${avg.toFixed(1)}`}>
              <span aria-hidden>{MOOD_EMOJI[Math.round(avg) - 1]}</span>
              <span className="font-semibold text-text tabular-nums">{avg.toFixed(1)}</span>
            </span>
          ) : undefined
        }
      />
      <Card tone="violet">
        <div className="mb-2 flex gap-4 text-[11px] text-muted" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-4 rounded-full bg-violet" /> настроение
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed border-info" /> энергия
          </span>
        </div>
        {hasMood ? (
          <MoodChart data={series} />
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <IconBadge name="activity" tone="violet" size="lg" />
            <p className="max-w-60 text-sm text-muted">Сделайте первый чек-ин — здесь появится график.</p>
          </div>
        )}
      </Card>

      <SectionHeader title="Инсайты" icon="sparkles" tone="violet" subtitle="Что влияет на настроение · 30 дней" />
      {insights.length === 0 ? (
        <Card className="flex items-center gap-3">
          <IconBadge name="sparkles" tone="violet" />
          <p className="text-sm text-muted">
            Отмечайте теги в чек-инах — через несколько дней здесь появится, что поднимает вам настроение.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2" aria-label="Инсайты по тегам">
          {insights.map((ins, i) => {
            const tone: Tone = ins.delta > 0 ? 'accent' : ins.delta < 0 ? 'danger' : 'muted'
            return (
              <motion.li key={ins.tag} {...staggerItem(i, reduce)}>
                <Card
                  as="div"
                  tone={tone === 'muted' ? undefined : tone}
                  className="flex items-start gap-3 p-3"
                  style={{ borderColor: tone === 'muted' ? undefined : toneTint(tone, 22) }}
                >
                  <span
                    className={`grid min-w-14 shrink-0 place-items-center rounded-2xl px-2 py-1.5 text-sm font-bold tabular-nums ${
                      tone === 'accent' ? 'bg-accent/15 text-accent' : tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-surface-3 text-muted'
                    }`}
                  >
                    {ins.delta > 0 ? '↑' : ins.delta < 0 ? '↓' : '='} {Math.abs(ins.delta).toFixed(1)}
                  </span>
                  <span className="min-w-0 text-sm leading-snug">
                    {insightText(ins)}
                    <span className="text-muted">
                      {' '}
                      · {ins.withCount} {plural(ins.withCount, ['отметка', 'отметки', 'отметок'])}
                    </span>
                  </span>
                </Card>
              </motion.li>
            )
          })}
        </ul>
      )}

      <SectionHeader title="Последние практики" icon="history" tone="violet" />
      {data && data.recent.length === 0 ? (
        <EmptyState
          icon="brain"
          tone="violet"
          title="Практик пока нет"
          hint="Начните с 5 минут тишины или пары циклов дыхания."
          action={
            <LinkButton to="/mind/meditate?min=5" icon="play">
              Медитация 5 мин
            </LinkButton>
          }
        />
      ) : (
        <Card className="p-1.5">
          <ul className="divide-y divide-white/[0.05]">
            {(data?.recent ?? []).map((s, i) => {
              const badge = MIND_KIND_BADGE[s.kind]
              return (
                <motion.li key={s.id} className="flex items-center gap-3 px-2.5 py-2.5" {...staggerItem(i, reduce)}>
                  <IconBadge name={badge.icon} tone={badge.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{MIND_KIND_LABEL[s.kind]}</span>
                    {s.note && <span className="block truncate text-xs text-muted">{s.note}</span>}
                  </span>
                  <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                    {s.durationMin} мин
                    <span className="block text-xs font-normal text-muted">{ddmm(s.date)}</span>
                  </span>
                </motion.li>
              )
            })}
          </ul>
        </Card>
      )}
    </>
  )
}

function CheckinTile({ slot, entry }: { slot: Slot; entry?: MoodEntry }) {
  const tone: Tone = slot === 'morning' ? 'warn' : 'violet'
  return (
    <Link
      to={`/mind/checkin?slot=${slot}`}
      className="group relative flex min-h-[76px] items-center gap-3 overflow-hidden rounded-3xl border border-white/[0.06] bg-surface p-3 shadow-[var(--shadow-card)] transition-[border-color,transform] duration-150 hover:border-white/15 active:scale-[0.98] motion-reduce:active:scale-100"
      style={{
        backgroundImage: `radial-gradient(120% 120% at 100% 0%, ${toneTint(tone, entry ? 18 : 8)} 0%, transparent 70%), var(--gradient-surface)`,
      }}
    >
      {entry ? (
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[28px] leading-none">
          {MOOD_EMOJI[entry.mood - 1]}
        </span>
      ) : (
        <IconBadge name={slot === 'morning' ? 'sun' : 'moon'} tone={tone} size="lg" />
      )}
      <span className="min-w-0">
        <span className="block text-xs font-medium tracking-wide text-muted uppercase">{SLOT_LABEL[slot]}</span>
        <span className={`block truncate text-[15px] font-semibold tracking-tight ${entry ? '' : 'text-muted group-hover:text-text'}`}>
          {entry ? MOOD_LABEL[entry.mood - 1] : 'Отметить'}
        </span>
      </span>
    </Link>
  )
}
