import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { WEEKDAY_SHORT_RU, today } from '../../lib/dates'
import { plural } from '../../lib/format'
import { Card, Stat } from '../../components/ui'
import { activeDates, calendarGrid, currentStreak, longestStreak } from './calc'
import { longDate } from './chartTheme'

const WEEKS = 8
const days = (n: number) => `${n} ${plural(n, ['день', 'дня', 'дней'])}`

export function StreakSection() {
  const data = useLiveQuery(async () => {
    const [sessions, activities] = await Promise.all([db.sessions.toArray(), db.activities.toArray()])
    return { sessions, activities }
  }, [])
  if (!data) return null

  const dates = activeDates(data.sessions, data.activities)
  const todayISO = today()
  const grid = calendarGrid(dates, WEEKS)
  const activeIn8Weeks = grid.flat().filter((c) => c.active).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="Текущая серия"
          value={days(currentStreak(dates, todayISO))}
          sub={dates.has(todayISO) ? 'сегодня ✓' : 'сегодня ещё нет'}
        />
        <Stat label="Лучшая серия" value={days(longestStreak(dates))} />
        <Stat label="За 8 недель" value={days(activeIn8Weeks)} sub="с активностью" />
      </div>

      <Card>
        <h2 className="mb-1 font-semibold">Календарь активности</h2>
        <p className="mb-3 text-xs text-muted">Зал или любая активность (кардио, растяжка) засчитывают день.</p>
        <div className="mx-auto max-w-sm">
          <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted">
            {WEEKDAY_SHORT_RU.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label="Календарь активности за 8 недель">
            {grid.flat().map((c) => (
              <div
                key={c.date}
                role="gridcell"
                title={`${longDate(c.date)}${c.active ? ' — активность' : ''}`}
                aria-label={`${longDate(c.date)}${c.active ? ', была активность' : ''}`}
                className={`flex aspect-square items-center justify-center rounded-lg text-[10px] ${
                  c.future
                    ? 'border border-dashed border-border/60 text-transparent'
                    : c.active
                      ? 'bg-accent font-semibold text-bg'
                      : 'bg-surface-2 text-muted'
                } ${c.date === todayISO ? 'ring-2 ring-text/70' : ''}`}
              >
                {Number(c.date.slice(8, 10))}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
