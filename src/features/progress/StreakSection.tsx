import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { WEEKDAY_SHORT_RU, today } from '../../lib/dates'
import { plural } from '../../lib/format'
import { motion } from 'motion/react'
import { Card, IconBadge, SectionHeader, StaggerList, StatTile } from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import { activeDates, calendarGrid, currentStreak, longestStreak } from './calc'
import { longDate } from './chartTheme'

const WEEKS = 8
const days = (n: number) => `${n} ${plural(n, ['день', 'дня', 'дней'])}`

export function StreakSection() {
  const reduce = useReduceMotion()
  const data = useLiveQuery(async () => {
    const [sessions, activities] = await Promise.all([
      db.sessions.toArray(),
      db.activities.toArray(),
    ])
    return { sessions, activities }
  }, [])
  if (!data) return null

  const dates = activeDates(data.sessions, data.activities)
  const todayISO = today()
  const grid = calendarGrid(dates, WEEKS)
  const activeIn8Weeks = grid.flat().filter((c) => c.active).length

  const streak = currentStreak(dates, todayISO)
  const cells = grid.flat()

  return (
    <div>
      <Card variant="accent" tone="warn" className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-wide text-muted uppercase">
              Текущая серия
            </div>
            <div className="mt-1.5 text-[40px] leading-none font-bold tracking-tight tabular-nums">
              {days(streak)}
            </div>
            <span
              className={`mt-2.5 inline-flex min-h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium ${
                dates.has(todayISO) ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-muted'
              }`}
            >
              {dates.has(todayISO) ? 'сегодня ✓' : 'сегодня ещё нет'}
            </span>
          </div>
          <IconBadge name="flame" tone="warn" size="lg" />
        </div>
      </Card>

      <StaggerList className="mt-3 grid grid-cols-2 gap-3" itemClassName="*:h-full" delay={0.08}>
        <StatTile
          key="best"
          icon="trophy"
          tone="amber"
          label="Лучшая серия"
          value={days(longestStreak(dates))}
        />
        <StatTile
          key="weeks"
          icon="calendar"
          tone="accent"
          label="За 8 недель"
          value={days(activeIn8Weeks)}
          sub="с активностью"
        />
      </StaggerList>

      <SectionHeader
        title="Календарь активности"
        subtitle="Зал или любая активность (кардио, растяжка) засчитывают день."
        icon="calendar"
        tone="accent"
      />
      <Card>
        <div className="mx-auto max-w-sm">
          <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-muted">
            {WEEKDAY_SHORT_RU.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div
            className="grid grid-cols-7 gap-1.5"
            role="grid"
            aria-label="Календарь активности за 8 недель"
          >
            {cells.map((c, i) => {
              const cls = `flex aspect-square items-center justify-center rounded-lg text-[10px] tabular-nums ${
                c.future
                  ? 'border border-dashed border-border/60 text-transparent'
                  : c.active
                    ? 'bg-accent font-semibold text-bg shadow-[0_4px_12px_-6px_rgb(180_240_60/0.8)]'
                    : 'bg-surface-2 text-muted'
              } ${c.date === todayISO ? 'ring-2 ring-text/70' : ''}`
              const props = {
                role: 'gridcell',
                title: `${longDate(c.date)}${c.active ? ' — активность' : ''}`,
                'aria-label': `${longDate(c.date)}${c.active ? ', была активность' : ''}`,
                className: cls,
              }
              const label = Number(c.date.slice(8, 10))
              return reduce ? (
                <div key={c.date} {...props}>
                  {label}
                </div>
              ) : (
                <motion.div
                  key={c.date}
                  {...props}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.24,
                    ease: [0.22, 1, 0.36, 1],
                    delay: Math.floor(i / 7) * 0.035 + (i % 7) * 0.012,
                  }}
                >
                  {label}
                </motion.div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center justify-end gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-[3px] bg-surface-2" /> нет
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-[3px] bg-accent" /> активность
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
