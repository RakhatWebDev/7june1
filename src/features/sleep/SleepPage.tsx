import { useLiveQuery } from 'dexie-react-hooks'
import { addDays } from 'date-fns'
import { Link } from 'react-router'
import {
  Card,
  EmptyState,
  IconBadge,
  LinkButton,
  PageHeader,
  Ring,
  SectionHeader,
  StaggerList,
  StatTile,
} from '../../components/ui'
import { Icon } from '../../components/icons'
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
      <PageHeader
        title="Сон"
        back="/growth"
        action={
          <LinkButton to="/sleep/new" size="sm" icon="plus">
            Записать
          </LinkButton>
        }
      />

      <section aria-label="Сводка" className="grid grid-cols-2 gap-3">
        <Card variant="elevated" tone="violet" className="col-span-2 flex items-center gap-4">
          <Ring
            value={last && targetMin ? last.durationMin / targetMin : 0}
            size={84}
            stroke={9}
            tone="violet"
          >
            <Icon name="moon" size={26} className="text-violet" />
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-muted">Прошлая ночь</p>
            <p className="text-[28px] leading-tight font-bold tracking-tight tabular-nums">
              {last ? formatMinutes(last.durationMin) : '—'}
            </p>
            {last && (
              <p className="truncate text-xs text-muted tabular-nums">
                {ddmm(last.date)} · {QUALITY_RU[last.quality]}
              </p>
            )}
          </div>
        </Card>
        <StatTile
          icon="chart"
          tone="violet"
          label="Среднее 7 дн."
          value={avg != null ? formatMinutes(avg) : '—'}
        />
        <StatTile
          icon="target"
          tone="violet"
          label="Цель"
          value={targetMin ? formatMinutes(targetMin) : '—'}
          sub={
            <Link to="/settings" className="text-violet hover:underline">
              изменить
            </Link>
          }
        />
      </section>

      <Card className="mt-3">
        <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Icon name="chart" size={17} className="text-violet" />
          Последние 14 дней
        </h2>
        <SleepChart data={chart} targetMin={targetMin ?? null} />
      </Card>

      <SectionHeader title="Записи" icon="history" tone="violet" />
      {recent && recent.length === 0 ? (
        <EmptyState
          icon="moon"
          tone="violet"
          title="Пока нет записей сна"
          hint="Запишите время отбоя и подъёма — посчитаем длительность."
          action={
            <LinkButton to="/sleep/new" icon="plus">
              Записать сон
            </LinkButton>
          }
        />
      ) : (
        <StaggerList as="ul" className="space-y-2">
          {(recent ?? []).map((e) => (
            <Card key={e.id} as="div" className="flex items-center gap-3 p-3">
              <IconBadge name="moon" tone="violet" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold tracking-tight tabular-nums">{formatMinutes(e.durationMin)}</span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{ddmm(e.date)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted tabular-nums">
                  <span>
                    {hhmm(e.bedtime)} – {hhmm(e.wakeTime)}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Icon name="star" size={13} className="text-violet" />
                    <span className="sr-only">качество </span>
                    {e.quality}/5
                  </span>
                </div>
                {e.notes && <div className="truncate text-xs text-muted">{e.notes}</div>}
              </div>
              <button
                type="button"
                aria-label={`Удалить сон ${ddmm(e.date)}`}
                className="-mr-1 grid size-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                onClick={() => void remove(e)}
              >
                <Icon name="trash" size={18} />
              </button>
            </Card>
          ))}
        </StaggerList>
      )}
    </>
  )
}
