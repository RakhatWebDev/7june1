import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  Button,
  Card,
  Confetti,
  CountUp,
  EmptyState,
  Icon,
  LinkButton,
  PageHeader,
  Progress,
  Ring,
  SectionHeader,
  StaggerList,
  type Tone,
} from '../../../components/ui'
import { useReduceMotion } from '../../../components/ui/helpers'
import type { Habit } from '../../../db/types'
import { fromISODate, today, weekdayIndex, WEEKDAY_SHORT_RU } from '../../../lib/dates'
import { colorVar, ddmm, shiftDate, tint } from '../shared'
import {
  activeHabits,
  bestStreak,
  completionRate,
  habitStreak,
  targetOf,
  weekCount,
  type HabitStatus,
} from './calc'
import { MiniWeek, SpringCheck, TintFlash } from './HabitCheck'
import { useEnsureHabitsSeeded, useHabitsData } from './hooks'
import { claimCelebration, setHabitDone, streakLabel } from './meta'

const HISTORY_DAYS = 365
const TONES: Tone[] = ['accent', 'info', 'warn', 'danger', 'violet', 'pink', 'amber']
const toneOf = (color: string): Tone => (TONES.includes(color as Tone) ? (color as Tone) : 'pink')

function dayLabel(date: string, todayDate: string): string {
  if (date === todayDate) return 'Сегодня'
  if (date === shiftDate(todayDate, -1)) return 'Вчера'
  return `${WEEKDAY_SHORT_RU[weekdayIndex(fromISODate(date))]}, ${ddmm(date)}`
}

export function HabitsPage() {
  useEnsureHabitsSeeded()
  const reduce = useReduceMotion()
  const todayDate = today()
  const from = shiftDate(todayDate, -HISTORY_DAYS)
  const data = useHabitsData(from)
  const [date, setDate] = useState(todayDate)
  const [dir, setDir] = useState(0)
  const [showArchive, setShowArchive] = useState(false)
  const [celebration, setCelebration] = useState(0)

  const habits = data ? activeHabits(data.habits) : []
  const archived = data ? data.habits.filter((h) => h.archived) : []
  const last7 = Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 6))
  const statusOf = (h: Habit): HabitStatus =>
    data?.status.get(h.id) ?? { done: new Set(), auto: new Set(), manual: new Map() }
  const doneCount = habits.filter((h) => statusOf(h).done.has(date)).length
  const total = habits.length
  const allDone = total > 0 && doneCount === total

  const go = (n: number) => {
    setDir(n)
    setDate(shiftDate(date, n))
  }

  /** Toggles a habit on the shown day; checking the last open habit of today fires confetti once a day. */
  const toggle = (h: Habit, done: boolean) => {
    void setHabitDone(h.id, date, !done)
    if (!done && date === todayDate && total > 0 && doneCount + 1 === total && claimCelebration(todayDate))
      setCelebration((n) => n + 1)
  }

  return (
    <>
      <PageHeader
        title="Привычки"
        back="/growth"
        action={
          <LinkButton to="/habits/new" size="sm" icon="plus">
            Новая
          </LinkButton>
        }
      />

      <div className="mb-3 flex items-center justify-between gap-2 rounded-full border border-white/[0.06] bg-surface-2/80 p-1">
        <button
          type="button"
          aria-label="Предыдущий день"
          className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition-[background-color,color,transform] hover:bg-surface-3 hover:text-text active:scale-90 motion-reduce:active:scale-100"
          onClick={() => go(-1)}
        >
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="relative min-w-0 flex-1 overflow-hidden text-center">
          {reduce ? (
            <div className="truncate font-semibold tracking-tight" data-testid="habits-day">
              {dayLabel(date, todayDate)}
            </div>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={date}
                initial={{ opacity: 0, x: dir * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -24 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="truncate font-semibold tracking-tight"
                data-testid="habits-day"
              >
                {dayLabel(date, todayDate)}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
        <button
          type="button"
          aria-label="Следующий день"
          className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition-[background-color,color,transform] hover:bg-surface-3 hover:text-text active:scale-90 disabled:pointer-events-none disabled:opacity-30 motion-reduce:active:scale-100"
          disabled={date >= todayDate}
          onClick={() => go(1)}
        >
          <Icon name="chevron-right" size={20} />
        </button>
      </div>

      {total > 0 && (
        <Card variant="elevated" tone="pink" className="relative mb-4 flex items-center gap-4">
          {celebration > 0 && <Confetti key={celebration} />}
          <Ring
            value={total ? doneCount / total : 0}
            size={68}
            stroke={8}
            tone="pink"
            aria-label={`Выполнено ${doneCount} из ${total}`}
          >
            {allDone ? (
              <Icon name="check" size={24} strokeWidth={2.5} className="text-pink" />
            ) : (
              <span className="text-[15px] font-semibold tabular-nums">
                <CountUp value={total ? Math.round((doneCount / total) * 100) : 0} />%
              </span>
            )}
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Прогресс дня</p>
            <p className="text-lg leading-tight font-semibold tracking-tight tabular-nums">
              {doneCount} из {total} выполнено
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {allDone ? 'Все привычки отмечены — отличный день!' : `Осталось: ${total - doneCount}`}
            </p>
          </div>
        </Card>
      )}

      {data && habits.length === 0 ? (
        <EmptyState
          icon="check"
          tone="pink"
          title="Нет активных привычек"
          hint="Добавьте первую привычку — маленькие шаги каждый день."
          action={
            <LinkButton to="/habits/new" icon="plus">
              Создать привычку
            </LinkButton>
          }
        />
      ) : (
        <ul className="mb-2 space-y-2.5" aria-label="Чеклист">
          {habits.map((h, i) => {
            const st = statusOf(h)
            const done = st.done.has(date)
            const streak = habitStreak(h, st.done, todayDate)
            return (
              <motion.li
                key={h.id}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 9) * 0.04 }}
              >
              <HabitRow
                habit={h}
                done={done}
                auto={st.auto.has(date)}
                streak={streak}
                subtitle={
                  h.frequency === 'weekly' ? (
                    <span className="tabular-nums">
                      {weekCount(st.done, date)} / {targetOf(h)} на неделе
                    </span>
                  ) : undefined
                }
                week={<MiniWeek dates={last7} done={st.done} color={h.color} />}
                onToggle={() => toggle(h, done)}
              />
              </motion.li>
            )
          })}
        </ul>
      )}

      {habits.length > 0 && (
        <section aria-label="Статистика" className="mb-6">
          <SectionHeader title="Статистика за 30 дней" icon="chart" tone="pink" />
          <Card>
            <ul className="space-y-3.5">
              {habits.map((h) => {
                const st = statusOf(h)
                const rate = completionRate(h, st.done, todayDate, 30)
                const best = bestStreak(h, st.done, from, todayDate)
                return (
                  <li key={h.id} data-testid={`stat-${h.id}`}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className="grid size-7 shrink-0 place-items-center rounded-lg text-base leading-none"
                          style={{ backgroundColor: tint(h.color, 14) }}
                        >
                          {h.icon}
                        </span>
                        <span className="truncate">{h.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        <span className="text-sm font-semibold text-text">{Math.round(rate * 100)}%</span> · рекорд{' '}
                        {streakLabel(h, best)}
                      </span>
                    </div>
                    <Progress value={rate} tone={toneOf(h.color)} className="h-1.5" aria-label={`${h.name}: ${Math.round(rate * 100)}%`} />
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      )}

      {archived.length > 0 && (
        <section aria-label="Архив">
          <Button
            variant="ghost"
            size="sm"
            iconRight={
              <Icon
                name="chevron-down"
                size={16}
                className={`transition-transform duration-200 ${showArchive ? 'rotate-180' : ''}`}
              />
            }
            onClick={() => setShowArchive((v) => !v)}
            aria-expanded={showArchive}
          >
            {showArchive ? 'Скрыть архив' : `Показать архив (${archived.length})`}
          </Button>
          {showArchive && (
            <StaggerList as="ul" className="mt-2 space-y-2">
              {archived.map((h) => (
                <Link
                  key={h.id}
                  to={`/habits/${h.id}`}
                  className="flex min-h-12 items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-2 text-muted transition-colors hover:text-text"
                >
                  <span aria-hidden className="text-xl grayscale-[40%]">
                    {h.icon}
                  </span>
                  {h.name}
                </Link>
              ))}
            </StaggerList>
          )}
        </section>
      )}
    </>
  )
}

/**
 * Full-width habit row: the whole top part is the checkbox (emoji badge, name, spring check);
 * below it the streak, the last 7 days and an edit link. Flashes with the habit colour on check.
 */
function HabitRow({
  habit,
  done,
  auto,
  streak,
  subtitle,
  week,
  onToggle,
}: {
  habit: Habit
  done: boolean
  auto: boolean
  streak: number
  subtitle?: ReactNode
  week: ReactNode
  onToggle: () => void
}) {
  const reduce = useReduceMotion()
  const [flash, setFlash] = useState(0)
  const { color } = habit
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border transition-[background-color,border-color] duration-300 ${
        done ? '' : 'border-white/[0.06] bg-surface bg-[image:var(--gradient-surface)]'
      }`}
      style={done ? { backgroundColor: tint(color, 9), borderColor: tint(color, 35) } : undefined}
    >
      {flash > 0 && !reduce && <TintFlash key={flash} color={color} />}
      <motion.button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={habit.name}
        onClick={() => {
          if (!done) setFlash((n) => n + 1)
          onToggle()
        }}
        whileTap={reduce ? undefined : { scale: 0.985 }}
        className="relative flex min-h-16 w-full items-center gap-3 px-3.5 pt-3 pb-2 text-left"
      >
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-2xl text-[26px] leading-none transition-colors duration-300"
          style={{ backgroundColor: tint(color, done ? 24 : 12) }}
        >
          {habit.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold tracking-tight">{habit.name}</span>
          <span className="mt-0.5 flex min-h-4 items-center gap-2 text-xs text-muted">
            {auto && done && (
              <span
                className="rounded-full px-1.5 py-px text-[10px] font-semibold uppercase"
                style={{ color: colorVar(color), backgroundColor: tint(color, 18) }}
              >
                авто
              </span>
            )}
            {subtitle ?? (habit.frequency === 'daily' ? 'Каждый день' : null)}
          </span>
        </span>
        <SpringCheck color={color} done={done} />
      </motion.button>
      <div className="relative flex items-center gap-3 px-3.5 pb-2.5 text-xs text-muted">
        <span
          className="flex shrink-0 items-center gap-1 tabular-nums"
          aria-label={`Серия: ${streakLabel(habit, streak)}`}
        >
          <Icon name="flame" size={14} className={streak > 0 ? 'text-amber' : ''} />
          {streakLabel(habit, streak)}
        </span>
        <span className="ml-auto">{week}</span>
        <Link
          to={`/habits/${habit.id}`}
          className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface-2 hover:text-text"
          aria-label={`Изменить «${habit.name}»`}
        >
          <Icon name="edit" size={16} />
        </Link>
      </div>
    </div>
  )
}
