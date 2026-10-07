import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { db } from '../../db'
import { newId } from '../../lib/id'
import { Button, Card, CountUp, Icon, IconBadge, Progress } from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import { n0 } from './format'

const DEFAULT_WATER_TARGET_ML = 2500

export function WaterCard({ date, targetMl }: { date: string; targetMl?: number }) {
  const reduce = useReduceMotion()
  const entries = useLiveQuery(
    () => db.water.where('date').equals(date).sortBy('createdAt'),
    [date],
  )
  const total = (entries ?? []).reduce((s, e) => s + e.ml, 0)
  const target = targetMl && targetMl > 0 ? targetMl : DEFAULT_WATER_TARGET_ML
  const done = total >= target

  const add = (ml: number) =>
    db.water.add({ id: newId(), date, ml, createdAt: new Date().toISOString() })

  return (
    <Card tone="info">
      <div className="flex items-center gap-3">
        <IconBadge name="droplet" tone="info" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-tight">Вода</h2>
          <p className="text-xs text-muted">
            {done ? 'Норма выполнена' : `Осталось ${n0(target - total)} мл`}
          </p>
        </div>
        <span className="text-sm text-muted tabular-nums" aria-label="Вода за день">
          <CountUp value={total} format={n0} className="text-lg font-semibold text-text" /> /{' '}
          {n0(target)} мл
        </span>
      </div>
      <Progress value={total / target} tone="info" className="mt-3 h-2.5" aria-label="Вода" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="droplet" size={15} className="text-info" />}
          onClick={() => add(250)}
        >
          +250 мл
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="droplet" size={17} className="text-info" />}
          onClick={() => add(500)}
        >
          +500 мл
        </Button>
      </div>
      {entries && entries.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {entries.map((e) => (
              <motion.li
                key={e.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-0.5 rounded-full border border-white/[0.06] bg-surface-2 py-0.5 pr-0.5 pl-2.5 text-xs tabular-nums"
              >
                <span>
                  {e.ml} мл ·{' '}
                  <span className="text-muted">
                    {new Date(e.createdAt).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Удалить ${e.ml} мл`}
                  className="grid size-7 place-items-center rounded-full text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                  onClick={() => db.water.delete(e.id)}
                >
                  <Icon name="x" size={14} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  )
}
