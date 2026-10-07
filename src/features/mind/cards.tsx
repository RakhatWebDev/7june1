import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { Card, LinkButton, StatTile } from '../../components/ui'
import { Icon } from '../../components/icons'
import { db } from '../../db'
import { today, weekDates } from '../../lib/dates'
import {
  defaultSlot,
  MOOD_EMOJI,
  MOOD_LABEL,
  moodEntryId,
  practiceMinutes,
  SLOT_LABEL,
  type MoodValue,
  type Slot,
} from './calc'
import { MoodPicker } from './parts'

/**
 * Dashboard card: quick mood check-in for the current slot (morning / evening) with five
 * emoji buttons; once both are filled — or the current one is — it shows a compact summary.
 */
export function MoodCheckinCard({ variant = 'card' }: { variant?: 'card' | 'strip' }) {
  const date = today()
  const slot = defaultSlot()
  const moods = useLiveQuery(() => db.moods.where('date').equals(date).toArray(), [date])
  if (moods === undefined) return null
  const bySlot = (s: Slot) => moods.find((m) => m.slot === s)
  const current = bySlot(slot)

  async function quickSave(mood: MoodValue) {
    await db.moods.put({
      id: moodEntryId(date, slot),
      date,
      slot,
      mood,
      createdAt: new Date().toISOString(),
    })
  }

  if (variant === 'strip') {
    return (
      <Card className="flex min-h-14 items-center gap-2.5 px-3 py-2">
        {current ? (
          <>
            <Link
              to="/mind"
              aria-label="Настроение"
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet/15 text-violet"
            >
              <Icon name="heart" size={18} />
            </Link>
            <ul className="grid min-w-0 flex-1 grid-cols-2 gap-2" aria-label="Чек-ины сегодня">
              {(['morning', 'evening'] as const).map((s) => {
                const m = bySlot(s)
                return (
                  <li key={s} className="min-w-0">
                    <Link
                      to={`/mind/checkin?slot=${s}`}
                      className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition hover:bg-surface-2"
                    >
                      <span className="text-xl leading-none" aria-hidden>
                        {m ? MOOD_EMOJI[m.mood - 1] : '·'}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] leading-tight text-muted">
                          {SLOT_LABEL[s]}
                        </span>
                        <span
                          className="block truncate text-sm leading-tight"
                          data-testid={`mood-summary-${s}`}
                        >
                          {m ? MOOD_LABEL[m.mood - 1] : 'не отмечено'}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 pl-1 text-[13px] leading-tight font-medium">
              {slot === 'morning' ? 'Как вы начинаете день?' : 'Как прошёл день?'}
            </p>
            <MoodPicker size="sm" value={null} onChange={(v) => void quickSave(v)} />
          </>
        )}
      </Card>
    )
  }

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Link to="/mind" className="flex items-center gap-2 font-semibold tracking-tight hover:text-violet">
          <Icon name="heart" size={18} className="text-violet" />
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
          <p className="mb-2 text-sm text-muted">
            {slot === 'morning' ? 'Как вы начинаете день?' : 'Как прошёл день?'}
          </p>
          <MoodPicker size="md" value={null} onChange={(v) => void quickSave(v)} />
        </>
      )}
    </Card>
  )
}

/** Dashboard card: practice minutes today / this week and a one-tap 10-minute meditation. `compact` = 2-column tile. */
export function MindTodayCard({ compact = false }: { compact?: boolean }) {
  const date = today()
  const week = weekDates()
  const data = useLiveQuery(
    () => db.mindSessions.where('date').between(week[0], week[6], true, true).toArray(),
    [week[0], week[6]],
  )
  const todayMin = practiceMinutes(data ?? [], date)
  const weekMin = practiceMinutes(data ?? [], week[0], week[6])
  if (compact) {
    return (
      <StatTile
        icon="brain"
        tone="violet"
        label="Практика"
        to="/mind"
        value={<span data-testid="mind-today-min">{todayMin}</span>}
        unit="мин"
        sub={`за неделю ${weekMin} мин`}
        action={
          <Link
            to="/mind/meditate?min=10"
            aria-label="Медитация 10 мин"
            className="grid size-8 place-items-center rounded-full bg-violet/15 text-violet transition active:scale-95"
          >
            <Icon name="play" size={14} />
          </Link>
        }
      />
    )
  }
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Link to="/mind" className="flex items-center gap-2 font-semibold tracking-tight hover:text-violet">
          <Icon name="brain" size={18} className="text-violet" />
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
        <LinkButton to="/mind/meditate?min=10" icon="play" className="flex-1">
          Медитация 10 мин
        </LinkButton>
        <LinkButton to="/mind/breathe" variant="secondary" icon="wind" aria-label="Дыхание" className="w-11 px-0" />
      </div>
    </Card>
  )
}
