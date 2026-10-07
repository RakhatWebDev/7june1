import { Card, IconBadge } from '../../components/ui'
import { Icon } from '../../components/icons'
import type { Activity } from '../../db/types'
import { formatMinutes } from '../../lib/dates'
import { int, km, plural } from '../../lib/format'
import { ACTIVITY_ICON, ACTIVITY_RU, formatPace, pace } from './calc'

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** One logged activity: tinted type icon, totals line, delete button. Rendered inside a list item. */
export function ActivityItem({ activity: a, onDelete }: { activity: Activity; onDelete: () => void }) {
  const p = pace(a.type, a.durationMin, a.distanceKm)
  const details: string[] = [formatMinutes(a.durationMin)]
  if (a.distanceKm) details.push(a.type === 'swim' ? `${Math.round(a.distanceKm * 1000)} м` : km(a.distanceKm))
  if (p) details.push(formatPace(p))
  if (a.count) details.push(`${int(a.count)} ${plural(a.count, ['прыжок', 'прыжка', 'прыжков'])}`)
  if (a.exerciseIds?.length)
    details.push(`${a.exerciseIds.length} ${plural(a.exerciseIds.length, ['упражнение', 'упражнения', 'упражнений'])}`)
  if (a.kcal != null) details.push(`${int(a.kcal)} ккал`)
  return (
    <Card as="div" className="flex items-center gap-3 p-3">
      <IconBadge name={ACTIVITY_ICON[a.type]} tone="info" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold tracking-tight">{ACTIVITY_RU[a.type]}</span>
          <span className="shrink-0 text-xs text-muted tabular-nums">{formatDate(a.date)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted tabular-nums">
          {details.map((d, i) => (
            <span key={i} className="whitespace-nowrap">
              {i > 0 && <span aria-hidden className="mr-1.5 text-muted/50">·</span>}
              {d}
            </span>
          ))}
          {a.avgHr ? (
            <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
              <span aria-hidden className="mr-1 text-muted/50">·</span>
              <Icon name="heart" size={13} className="text-danger" />
              <span className="sr-only">пульс</span>
              {a.avgHr}
            </span>
          ) : null}
        </div>
        {a.notes && <div className="truncate text-xs text-muted">{a.notes}</div>}
      </div>
      <button
        type="button"
        aria-label={`Удалить: ${ACTIVITY_RU[a.type]} ${formatDate(a.date)}`}
        className="-mr-1 grid size-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-danger/15 hover:text-danger"
        onClick={onDelete}
      >
        <Icon name="trash" size={18} />
      </button>
    </Card>
  )
}
