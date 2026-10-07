import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { ISODate } from '../../db/types'
import { currencySign } from './metrics'
import { collectWeekStats } from './stats'

/** Live weekly stats for the week starting `weekStart` (undefined while loading). */
export function useWeekStats(weekStart: ISODate | undefined) {
  return useLiveQuery(() => (weekStart ? collectWeekStats(db, weekStart) : undefined), [weekStart])
}

/** Currency sign from settings['currency'] (₸ by default). */
export function useCurrencySign(): string {
  const setting = useLiveQuery(() => db.settings.get('currency'), [])
  return currencySign(setting?.value ?? 'KZT')
}

/** All weekly reviews, newest first. */
export function useReviews() {
  return useLiveQuery(() => db.weeklyReviews.orderBy('weekStart').reverse().toArray(), [])
}
