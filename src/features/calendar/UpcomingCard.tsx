import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { Card } from '../../components/ui'
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
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Ближайшие занятия</h2>
        <Link to="/calendar" className="text-sm text-accent hover:underline">
          Календарь →
        </Link>
      </div>
      {events === undefined ? (
        <p className="text-sm text-muted">Загрузка…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted">
          Нет записей на неделю.{' '}
          <Link to="/calendar" className="text-accent hover:underline">
            Импортируйте календарь
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-border">
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
