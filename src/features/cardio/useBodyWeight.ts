import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { pickWeight } from './calc'

/** Body weight for kcal estimates: latest `weights` entry, else `profile.weightKg`; null if unknown. */
export function useBodyWeight(): number | null {
  return (
    useLiveQuery(async () => {
      const [last, profile] = await Promise.all([db.weights.orderBy('date').last(), db.profile.get(1)])
      return pickWeight(last?.weightKg, profile?.weightKg)
    }, []) ?? null
  )
}
