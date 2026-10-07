import { useLiveQuery } from 'dexie-react-hooks'
import { addDays } from 'date-fns'
import { Link } from 'react-router'
import { Button, Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db'
import type { SleepEntry } from '../../db/types'
import { formatMinutes, fromISODate, today, toISODate } from '../../lib/dates'
import { averageSleep, latestSleep, QUALITY_RU, sleepChartData } from './calc'
import { SleepChart } from './SleepChart'

function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

const linkBtn = 'rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-strong'

export function SleepPage() {
  const ref = today()
  const from = toISODate(addDays(fromISODate(ref), -29))
  const entries = useLiveQuery(() => db.sleep.where('date').aboveOrEqual(from).toArray(), [from])
  const recent = useLiveQuery(() => db.sleep.orderBy('date').reverse().limit(30).toArray(), [])
  const targetMin = useLiveQuery(async () => (await db.profile.get(1))?.sleepTargetMin ?? null, [])

  const list = entries ?? []
  const last = latestSleep(list)
  const avg = averageSleep(list, ref, 7)
  const chart = sleepChartData(list, ref, 14)

  async function remove(e: SleepEntry) {
    if (!window.confirm('Удалить запись сна?')) return
    await db.sleep.delete(e.id)
  }

  return (
    <>
      <PageHeader title="Сон" action={<Link to="/sleep/new" className={linkBtn}>+ Записать</Link>} />

      <section aria-label="Сводка" className="mb-4 grid grid-cols-3 gap-2">
        <Stat
          label="Прошлая ночь"
          value={last ? formatMinutes(last.durationMin) : '—'}
          sub={last ? `${ddmm(last.date)} · ${QUALITY_RU[last.quality]}` : undefined}
        />
        <Stat label="Среднее 7 дн." value={avg != null ? formatMinutes(avg) : '—'} />
        <Stat label="Цель" value={targetMin ? formatMinutes(targetMin) : '—'} sub={<Link to="/settings">изменить</Link>} />
      </section>

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-medium text-muted">Последние 14 дней</h2>
        <SleepChart data={chart} targetMin={targetMin ?? null} />
      </Card>

      <h2 className="mb-2 text-sm font-medium text-muted">Записи</h2>
      {recent && recent.length === 0 ? (
        <EmptyState
          title="Пока нет записей сна"
          hint="Запишите время отбоя и подъёма — посчитаем длительность."
          action={<Link to="/sleep/new" className={linkBtn}>Записать сон</Link>}
        />
      ) : (
        <ul className="space-y-2">
          {(recent ?? []).map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{formatMinutes(e.durationMin)}</span>
                  <span className="shrink-0 text-xs text-muted">{ddmm(e.date)}</span>
                </div>
                <div className="text-sm text-muted">
                  {hhmm(e.bedtime)} → {hhmm(e.wakeTime)} · качество {e.quality}/5
                </div>
                {e.notes && <div className="truncate text-xs text-muted">{e.notes}</div>}
              </div>
              <Button variant="ghost" size="sm" aria-label={`Удалить сон ${ddmm(e.date)}`} onClick={() => void remove(e)}>
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
