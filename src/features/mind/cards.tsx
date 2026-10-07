import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { Card } from '../../components/ui'
import { db } from '../../db'
import { today, weekDates } from '../../lib/dates'
import { defaultSlot, MOOD_EMOJI, MOOD_LABEL, moodEntryId, practiceMinutes, SLOT_LABEL, type MoodValue, type Slot } from './calc'
import { MoodPicker } from './parts'
import { linkPrimary, linkSecondary } from './styles'

/**
 * Dashboard card: quick mood check-in for the current slot (morning / evening) with five
 * emoji buttons; once both are filled — or the current one is — it shows a compact summary.
 */
export function MoodCheckinCard() {
  const date = today()
  const slot = defaultSlot()
  const moods = useLiveQuery(() => db.moods.where('date').equals(date).toArray(), [date])
  if (moods === undefined) return null
  const bySlot = (s: Slot) => moods.find((m) => m.slot === s)
  const current = bySlot(slot)

  async function quickSave(mood: MoodValue) {
    await db.moods.put({ id: moodEntryId(date, slot), date, slot, mood, createdAt: new Date().toISOString() })
  }

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Link to="/mind" className="font-semibold hover:text-accent">
          Настроение
        </Link>
        <span className="text-xs text-muted">{SLOT_LABEL[slot]}</span>
      </div>
      {current ? (
        <ul className="grid grid-cols-2 gap-2" aria-label="Чек-ины сегодня">
          {(['morning', 'evening'] as const).map((s) => {
            const m = bySlot(s)
            return (
              <li key={s}>
                <Link
                  to={`/mind/checkin?slot=${s}`}
                  className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 transition hover:bg-border"
                >
                  <span className="text-2xl" aria-hidden>
                    {m ? MOOD_EMOJI[m.mood - 1] : '·'}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] text-muted">{SLOT_LABEL[s]}</span>
                    <span className="block truncate text-sm" data-testid={`mood-summary-${s}`}>
                      {m ? MOOD_LABEL[m.mood - 1] : 'не отмечено'}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">{slot === 'morning' ? 'Как вы начинаете день?' : 'Как прошёл день?'}</p>
          <MoodPicker size="md" value={null} onChange={(v) => void quickSave(v)} />
        </>
      )}
    </Card>
  )
}

/** Dashboard card: practice minutes today / this week and a one-tap 10-minute meditation. */
export function MindTodayCard() {
  const date = today()
  const week = weekDates()
  const data = useLiveQuery(
    () => db.mindSessions.where('date').between(week[0], week[6], true, true).toArray(),
    [week[0], week[6]],
  )
  const todayMin = practiceMinutes(data ?? [], date)
  const weekMin = practiceMinutes(data ?? [], week[0], week[6])
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Link to="/mind" className="font-semibold hover:text-accent">
          Практика
        </Link>
        <span className="text-xs text-muted tabular-nums">за неделю {weekMin} мин</span>
      </div>
      <div className="mb-3 flex items-baseline gap-1">
        <span className="text-3xl font-bold tabular-nums" data-testid="mind-today-min">
          {todayMin}
        </span>
        <span className="text-sm text-muted">мин сегодня</span>
      </div>
      <div className="flex gap-2">
        <Link to="/mind/meditate?min=10" className={`${linkPrimary} flex-1`}>
          🧘 Медитация 10 мин
        </Link>
        <Link to="/mind/breathe" className={linkSecondary} aria-label="Дыхание">
          🌬️
        </Link>
      </div>
    </Card>
  )
}
