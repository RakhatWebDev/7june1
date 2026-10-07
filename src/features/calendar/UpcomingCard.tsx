import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { Card, IconBadge } from '../../components/ui'
import { Icon } from '../../components/icons'
import { db } from '../../db'
import { KIND_META, relativeLabel, upcomingEvents } from './meta'
import { useNow } from './useNow'

const DAY_MS = 86_400_000

/** Dashboard card: the next 3 calendar events within 7 days (OneFit bookings etc.). */
export function UpcomingCard() {
  const now = useNow()
  const minuteKey = Math.floor(now.getTime() / 60_000)
  const events = useLiveQuery(async () => {
    const t = minuteKey * 60_000
    // Look back a day so events in progress (started, not yet ended) are still shown.
    const rows = await db.calendarEvents
      .where('startAt')
      .between(new Date(t - DAY_MS).toISOString(), new Date(t + 7 * DAY_MS).toISOString())
      .toArray()
    return upcomingEvents(rows, new Date(t), 7).slice(0, 3)
  }, [minuteKey])

  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-3">
        <IconBadge name="calendar" tone="info" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold tracking-tight">Ближайшие занятия</h2>
          {events === undefined ? (
            <p className="text-xs text-muted">Загрузка…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-muted">
              Нет записей на неделю.{' '}
              <Link to="/calendar" className="text-accent hover:underline">
                Импортируйте календарь
              </Link>
            </p>
          ) : (
            <p className="text-xs text-muted tabular-nums">на 7 дней вперёд</p>
          )}
        </div>
        <Link
          to="/calendar"
          aria-label="Календарь"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:text-text"
        >
          <Icon name="chevron-right" size={18} />
        </Link>
      </div>
      {events && events.length > 0 && (
        <ul className="mt-2 divide-y divide-white/[0.06]">
          {events.map((ev) => (
            <li key={ev.id} className="flex items-center gap-3 py-2">
              <span aria-hidden className="text-xl leading-none">
                {KIND_META[ev.kind].icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{ev.title}</p>
                <p className="truncate text-xs text-muted">
                  <span className="text-text">{relativeLabel(ev.startAt, ev.allDay, now)}</span>
                  {ev.location && <> · {ev.location}</>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
