import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { PageHeader, Progress } from '../../components/ui'
import { db } from '../../db'
import { formatMinutes, today, weekDates } from '../../lib/dates'
import { plural } from '../../lib/format'
import { useCurrentBook } from './books/hooks'
import { useHabitsToday } from './habits/hooks'
import { CURRENCY_KEY, currencySymbol, goalsSummary, money, monthExpenses, MOOD_EMOJI, moodBySlot } from './hub'
import { ddmm, tint, colorVar } from './shared'

const QUALITY_RU = ['', 'ужасно', 'плохо', 'нормально', 'хорошо', 'отлично']

function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function HubCard({
  to,
  icon,
  color,
  title,
  children,
}: {
  to: string
  icon: string
  color: string
  title: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className="block rounded-3xl border border-border bg-surface p-5 transition-[border-color,transform] hover:border-accent/60 active:scale-[0.99]"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl"
          style={{ backgroundColor: tint(color, 18), color: colorVar(color) }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <div className="mt-1 text-sm text-muted">{children}</div>
        </div>
        <span aria-hidden className="self-center text-muted">
          ›
        </span>
      </div>
    </Link>
  )
}

export function GrowthPage() {
  const habits = useHabitsToday()
  const reading = useCurrentBook()
  const lastSleep = useLiveQuery(async () => (await db.sleep.orderBy('date').reverse().first()) ?? null, [])
  const todayDate = today()
  const streak = habits?.streak ?? 0
  const week = weekDates()
  const month = todayDate.slice(0, 7)
  const hub = useLiveQuery(async () => {
    const [moods, mind, txs, goals, currency] = await Promise.all([
      db.moods.where('date').equals(todayDate).toArray(),
      db.mindSessions.where('date').between(week[0], week[6], true, true).toArray(),
      db.transactions.where('date').between(`${month}-01`, `${month}-31`, true, true).toArray(),
      db.lifeGoals.toArray(),
      db.settings.get(CURRENCY_KEY),
    ])
    return {
      mood: moodBySlot(moods),
      mindMinutes: mind.reduce((s, m) => s + (m.durationMin || 0), 0),
      spent: monthExpenses(txs, month),
      goals: goalsSummary(goals),
      symbol: currencySymbol(currency?.value),
    }
  }, [todayDate, week[0], week[6], month])

  return (
    <>
      <PageHeader title="Развитие" subtitle="Привычки, цели, книги, разум, финансы и сон" />

      <p
        className="mb-4 rounded-2xl border border-border bg-surface-2/60 px-4 py-3 text-center font-semibold"
        data-testid="growth-streak"
      >
        <span aria-hidden>🔥</span> Серия: {streak} {plural(streak, ['день', 'дня', 'дней'])}
        <span className="block text-xs font-normal text-muted">
          {streak > 0 ? 'подряд выполнены все ежедневные привычки' : 'выполните все ежедневные привычки сегодня, чтобы начать серию'}
        </span>
      </p>

      <div className="space-y-3">
        <HubCard to="/habits" icon="✅" color="pink" title="Привычки">
          {habits ? (
            <>
              <span className="text-text tabular-nums" data-testid="hub-habits">
                Сегодня выполнено {habits.done} из {habits.total}
              </span>
              <Progress className="mt-2" value={habits.total ? habits.done / habits.total : 0} />
              <span className="mt-1 block">
                Текущая серия: {streak} {plural(streak, ['день', 'дня', 'дней'])}
              </span>
            </>
          ) : (
            '…'
          )}
        </HubCard>

        <HubCard to="/goals" icon="🎯" color="accent" title="Цели">
          {hub ? (
            <>
              <span className="text-text tabular-nums" data-testid="hub-goals">
                Активных целей: {hub.goals.active}
              </span>
              {hub.goals.avgProgress !== null && (
                <>
                  <Progress className="mt-2" value={hub.goals.avgProgress} />
                  <span className="mt-1 block tabular-nums">
                    Средний прогресс: {Math.round(hub.goals.avgProgress * 100)}%
                  </span>
                </>
              )}
            </>
          ) : (
            '…'
          )}
        </HubCard>

        <HubCard to="/books" icon="📚" color="amber" title="Книги">
          {reading?.book ? (
            <>
              <span className="text-text">
                Читаю сейчас: <span data-testid="hub-book">{reading.book.title}</span>
              </span>
              {reading.book.totalPages ? (
                <>
                  <Progress className="mt-2" value={reading.percent / 100} />
                  <span className="mt-1 block tabular-nums">{reading.percent}% прочитано</span>
                </>
              ) : null}
            </>
          ) : reading ? (
            'Сейчас ничего не читаете — выберите книгу'
          ) : (
            '…'
          )}
        </HubCard>

        <HubCard to="/mind" icon="🧘" color="info" title="Разум и дух">
          {hub ? (
            <>
              <span className="text-text" data-testid="hub-mood">
                Утро: {hub.mood.morning ? MOOD_EMOJI[hub.mood.morning] : 'не отмечено'} · Вечер:{' '}
                {hub.mood.evening ? MOOD_EMOJI[hub.mood.evening] : 'не отмечено'}
              </span>
              <span className="mt-1 block tabular-nums">Практики за неделю: {hub.mindMinutes} мин</span>
            </>
          ) : (
            '…'
          )}
        </HubCard>

        <HubCard to="/finance" icon="💰" color="warn" title="Финансы">
          {hub ? (
            <>
              <span className="text-text tabular-nums" data-testid="hub-finance">
                Потрачено в этом месяце: {money(hub.spent.total, hub.symbol)}
              </span>
              <span className="mt-1 block tabular-nums">
                {hub.spent.count} {plural(hub.spent.count, ['операция', 'операции', 'операций'])}
              </span>
            </>
          ) : (
            '…'
          )}
        </HubCard>

        <HubCard to="/sleep" icon="🌙" color="violet" title="Сон">
          {lastSleep ? (
            <>
              <span className="text-text">
                {lastSleep.date === todayDate ? 'Прошлая ночь' : `Последняя запись ${ddmm(lastSleep.date)}`}:{' '}
                {formatMinutes(lastSleep.durationMin)}
              </span>
              <span className="mt-1 block tabular-nums">
                {hhmm(lastSleep.bedtime)} → {hhmm(lastSleep.wakeTime)} · {QUALITY_RU[lastSleep.quality]}
              </span>
            </>
          ) : lastSleep === null ? (
            'Нет записей — добавьте прошлую ночь'
          ) : (
            '…'
          )}
        </HubCard>
      </div>
    </>
  )
}
