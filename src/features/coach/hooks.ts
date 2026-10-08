import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { toISODate } from '../../lib/dates'
import { generateInsights, getDismissed, getRuleSettings } from './insights'

/** Re-evaluates time-based rules (water at 16:00, habits after 18:00) every few minutes. */
function useTick(ms = 5 * 60_000): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
  return tick
}

/** Visible insights for now (dismissed ones removed); `undefined` while loading. */
export function useInsights() {
  const tick = useTick()
  return useLiveQuery(() => generateInsights(db, new Date()), [tick])
}

/** Everything the /coach page needs: all insights, today's dismissed ids and rule toggles. */
export function useCoachState() {
  const tick = useTick()
  return useLiveQuery(async () => {
    const now = new Date()
    const [all, dismissed, rules] = await Promise.all([
      generateInsights(db, now, { includeDismissed: true }),
      getDismissed(db, toISODate(now)),
      getRuleSettings(db),
    ])
    return { all, dismissed, rules }
  }, [tick])
}
