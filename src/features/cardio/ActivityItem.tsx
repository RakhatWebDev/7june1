import { Button } from '../../components/ui'
import type { Activity } from '../../db/types'
import { formatMinutes } from '../../lib/dates'
import { int, km, plural } from '../../lib/format'
import { ACTIVITY_ICON, ACTIVITY_RU, formatPace, pace } from './calc'

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export function ActivityItem({ activity: a, onDelete }: { activity: Activity; onDelete: () => void }) {
  const p = pace(a.type, a.durationMin, a.distanceKm)
  const details: string[] = [formatMinutes(a.durationMin)]
  if (a.distanceKm) details.push(a.type === 'swim' ? `${Math.round(a.distanceKm * 1000)} м` : km(a.distanceKm))
  if (p) details.push(formatPace(p))
  if (a.count) details.push(`${int(a.count)} ${plural(a.count, ['прыжок', 'прыжка', 'прыжков'])}`)
  if (a.exerciseIds?.length)
    details.push(`${a.exerciseIds.length} ${plural(a.exerciseIds.length, ['упражнение', 'упражнения', 'упражнений'])}`)
  if (a.avgHr) details.push(`♥ ${a.avgHr}`)
  if (a.kcal != null) details.push(`${int(a.kcal)} ккал`)
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl">
        {ACTIVITY_ICON[a.type]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">{ACTIVITY_RU[a.type]}</span>
          <span className="shrink-0 text-xs text-muted">{formatDate(a.date)}</span>
        </div>
        <div className="text-sm text-muted">{details.join(' · ')}</div>
        {a.notes && <div className="truncate text-xs text-muted">{a.notes}</div>}
      </div>
      <Button variant="ghost" size="sm" aria-label={`Удалить: ${ACTIVITY_RU[a.type]} ${formatDate(a.date)}`} onClick={onDelete}>
        ✕
      </Button>
    </li>
  )
}
