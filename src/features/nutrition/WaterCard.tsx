import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { newId } from '../../lib/id'
import { Button, Card, Progress } from '../../components/ui'
import { n0 } from './format'

const DEFAULT_WATER_TARGET_ML = 2500

export function WaterCard({ date, targetMl }: { date: string; targetMl?: number }) {
  const entries = useLiveQuery(() => db.water.where('date').equals(date).sortBy('createdAt'), [date])
  const total = (entries ?? []).reduce((s, e) => s + e.ml, 0)
  const target = targetMl && targetMl > 0 ? targetMl : DEFAULT_WATER_TARGET_ML

  const add = (ml: number) => db.water.add({ id: newId(), date, ml, createdAt: new Date().toISOString() })

  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold">Вода</h2>
        <span className="text-sm text-muted" aria-label="Вода за день">
          <span className="text-text">{n0(total)}</span> / {n0(target)} мл
        </span>
      </div>
      <Progress value={total / target} className="[&>div]:bg-info" />
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => add(250)}>
          +250 мл
        </Button>
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => add(500)}>
          +500 мл
        </Button>
      </div>
      {entries && entries.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-3 text-xs"
            >
              <span>
                {e.ml} мл ·{' '}
                {new Date(e.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <button
                type="button"
                aria-label={`Удалить ${e.ml} мл`}
                className="rounded-full px-1.5 text-muted hover:text-danger"
                onClick={() => db.water.delete(e.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
