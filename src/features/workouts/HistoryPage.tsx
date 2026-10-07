import { useState } from 'react'
import { Link } from 'react-router'
import { Card, EmptyState, IconBadge, LinkButton, PageHeader, SectionHeader, StaggerList, StatTile } from '../../components/ui'
import { Icon } from '../../components/icons'
import { WorkoutsNav } from '../../components/WorkoutsNav'
import type { WorkoutSession } from '../../db/types'
import { formatMinutes } from '../../lib/dates'
import { int, plural } from '../../lib/format'
import { deleteSession } from './actions'
import { doneSetCount, sessionDurationMin, sessionVolume } from './calc'
import { ConfirmSheet } from './ConfirmSheet'
import { useSessions } from './hooks'
import { formatSessionDate } from './labels'

const WEEK_MS = 7 * 86_400_000

/** /workouts/history — sessions newest first, grouped by day, with delete. */
export function HistoryPage() {
  const sessions = useSessions()
  const [toDelete, setToDelete] = useState<WorkoutSession | null>(null)
  const [now] = useState(() => Date.now())

  const groups: [string, WorkoutSession[]][] = []
  for (const s of sessions ?? []) {
    const day = formatSessionDate(s.startedAt)
    const last = groups[groups.length - 1]
    if (last && last[0] === day) last[1].push(s)
    else groups.push([day, [s]])
  }
  const week = (sessions ?? []).filter((s) => now - Date.parse(s.startedAt) < WEEK_MS)
  const weekVolume = week.reduce((a, s) => a + sessionVolume(s), 0)

  return (
    <>
      <PageHeader
        title="История"
        subtitle={
          sessions
            ? `${sessions.length} ${plural(sessions.length, ['тренировка', 'тренировки', 'тренировок'])}`
            : undefined
        }
      />
      <WorkoutsNav />
      {sessions && sessions.length === 0 && (
        <EmptyState
          icon="history"
          title="Тренировок пока нет"
          hint="Начните тренировку из программы — она появится здесь."
          action={
            <LinkButton to="/workouts" variant="secondary" icon="list">
              К программам
            </LinkButton>
          }
        />
      )}
      {sessions && sessions.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            icon="dumbbell"
            tone="accent"
            label="За 7 дней"
            value={week.length}
            unit={plural(week.length, ['тренировка', 'тренировки', 'тренировок'])}
            sub={`всего ${sessions.length}`}
          />
          <StatTile icon="chart" tone="accent" label="Объём · 7 дн." value={int(weekVolume)} unit="кг" />
        </div>
      )}
      {groups.map(([day, list], gi) => (
        <section key={day}>
          <SectionHeader as="h2" title={<span className="capitalize">{day}</span>} icon="calendar" tone="accent" className={gi === 0 ? '' : 'mt-5'} />
          <StaggerList as="ul" className="space-y-2" delay={Math.min(gi, 4) * 0.04}>
            {list.map((s) => (
              <HistoryRow key={s.id} session={s} onDelete={() => setToDelete(s)} />
            ))}
          </StaggerList>
        </section>
      ))}
      <ConfirmSheet
        open={toDelete !== null}
        title="Удалить тренировку?"
        text={toDelete ? `«${toDelete.name}» будет удалена без возможности восстановления.` : undefined}
        onConfirm={() => toDelete && void deleteSession(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </>
  )
}

function HistoryRow({ session: s, onDelete }: { session: WorkoutSession; onDelete: () => void }) {
  const sets = doneSetCount(s)
  return (
    <Card as="div" className="flex items-center gap-1 p-0 transition-[border-color] hover:border-accent/40">
      <Link to={`/workouts/session/${s.id}`} className="group flex min-w-0 flex-1 items-center gap-3 p-3.5">
        <IconBadge name={s.finishedAt ? 'dumbbell' : 'play'} tone="accent" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold tracking-tight transition-colors group-hover:text-accent">
              {s.name}
            </span>
            {!s.finishedAt && (
              <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">Идёт</span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted tabular-nums">
            {formatMinutes(sessionDurationMin(s))} · {int(sessionVolume(s))} кг · {sets}{' '}
            {plural(sets, ['подход', 'подхода', 'подходов'])}
          </span>
        </span>
      </Link>
      <button
        type="button"
        aria-label={`Удалить тренировку ${s.name}`}
        className="mr-2 grid size-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-danger/15 hover:text-danger"
        onClick={onDelete}
      >
        <Icon name="trash" size={18} />
      </button>
    </Card>
  )
}
