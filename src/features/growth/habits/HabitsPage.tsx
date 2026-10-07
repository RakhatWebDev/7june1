import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, EmptyState, PageHeader, Progress } from '../../../components/ui'
import type { Habit } from '../../../db/types'
import { fromISODate, today, weekdayIndex, WEEKDAY_SHORT_RU } from '../../../lib/dates'
import { ddmm, shiftDate } from '../shared'
import {
  activeHabits,
  bestStreak,
  completionRate,
  habitStreak,
  targetOf,
  weekCount,
  type HabitStatus,
} from './calc'
import { HabitCheck, MiniWeek } from './HabitCheck'
import { useEnsureHabitsSeeded, useHabitsData } from './hooks'
import { setHabitDone, streakLabel } from './meta'

const HISTORY_DAYS = 365
const linkBtn = 'rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-strong'

function dayLabel(date: string, todayDate: string): string {
  if (date === todayDate) return 'Сегодня'
  if (date === shiftDate(todayDate, -1)) return 'Вчера'
  return `${WEEKDAY_SHORT_RU[weekdayIndex(fromISODate(date))]}, ${ddmm(date)}`
}

export function HabitsPage() {
  useEnsureHabitsSeeded()
  const todayDate = today()
  const from = shiftDate(todayDate, -HISTORY_DAYS)
  const data = useHabitsData(from)
  const [date, setDate] = useState(todayDate)
  const [showArchive, setShowArchive] = useState(false)

  const habits = data ? activeHabits(data.habits) : []
  const archived = data ? data.habits.filter((h) => h.archived) : []
  const last7 = Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 6))
  const statusOf = (h: Habit): HabitStatus =>
    data?.status.get(h.id) ?? { done: new Set(), auto: new Set(), manual: new Map() }
  const doneCount = habits.filter((h) => statusOf(h).done.has(date)).length

  return (
    <>
      <PageHeader title="Привычки" back="/growth" action={<Link to="/habits/new" className={linkBtn}>+ Новая</Link>} />

      <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-1">
        <Button variant="ghost" aria-label="Предыдущий день" className="min-h-11 min-w-11" onClick={() => setDate(shiftDate(date, -1))}>
          ←
        </Button>
        <div className="text-center">
          <div className="font-semibold" data-testid="habits-day">
            {dayLabel(date, todayDate)}
          </div>
          <div className="text-xs text-muted tabular-nums">
            {doneCount} из {habits.length} выполнено
          </div>
        </div>
        <Button
          variant="ghost"
          aria-label="Следующий день"
          className="min-h-11 min-w-11"
          disabled={date >= todayDate}
          onClick={() => setDate(shiftDate(date, 1))}
        >
          →
        </Button>
      </div>

      {data && habits.length === 0 ? (
        <EmptyState
          title="Нет активных привычек"
          hint="Добавьте первую привычку — маленькие шаги каждый день."
          action={<Link to="/habits/new" className={linkBtn}>Создать привычку</Link>}
        />
      ) : (
        <ul className="mb-6 space-y-3" aria-label="Чеклист">
          {habits.map((h) => {
            const st = statusOf(h)
            const done = st.done.has(date)
            const streak = habitStreak(h, st.done, todayDate)
            return (
              <li key={h.id}>
                <HabitCheck
                  icon={h.icon}
                  name={h.name}
                  color={h.color}
                  done={done}
                  auto={st.auto.has(date)}
                  subtitle={
                    h.frequency === 'weekly' ? (
                      <span className="tabular-nums">
                        {weekCount(st.done, date)} / {targetOf(h)} на неделе
                      </span>
                    ) : undefined
                  }
                  onToggle={() => void setHabitDone(h.id, date, !done)}
                />
                <div className="mt-1.5 flex items-center gap-3 px-2 text-xs text-muted">
                  <span className="tabular-nums" aria-label={`Серия: ${streakLabel(h, streak)}`}>
                    <span aria-hidden>🔥</span> {streakLabel(h, streak)}
                  </span>
                  <MiniWeek dates={last7} done={st.done} color={h.color} />
                  <Link to={`/habits/${h.id}`} className="ml-auto px-2 py-1 hover:text-text" aria-label={`Изменить «${h.name}»`}>
                    Изменить
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {habits.length > 0 && (
        <section aria-label="Статистика" className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-muted">Статистика за 30 дней</h2>
          <Card>
            <ul className="space-y-3">
              {habits.map((h) => {
                const st = statusOf(h)
                const rate = completionRate(h, st.done, todayDate, 30)
                const best = bestStreak(h, st.done, from, todayDate)
                return (
                  <li key={h.id} data-testid={`stat-${h.id}`}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">
                        <span aria-hidden>{h.icon}</span> {h.name}
                      </span>
                      <span className="shrink-0 text-muted tabular-nums">
                        {Math.round(rate * 100)}% · рекорд {streakLabel(h, best)}
                      </span>
                    </div>
                    <Progress value={rate} />
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      )}

      {archived.length > 0 && (
        <section aria-label="Архив">
          <Button variant="ghost" size="sm" onClick={() => setShowArchive((v) => !v)} aria-expanded={showArchive}>
            {showArchive ? 'Скрыть архив' : `Показать архив (${archived.length})`}
          </Button>
          {showArchive && (
            <ul className="mt-2 space-y-2">
              {archived.map((h) => (
                <li key={h.id}>
                  <Link
                    to={`/habits/${h.id}`}
                    className="flex min-h-12 items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-2 text-muted hover:text-text"
                  >
                    <span aria-hidden className="text-xl">
                      {h.icon}
                    </span>
                    {h.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}
