import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { TxCategory } from '../../db/types'
import { CURRENCY_SETTING_KEY, parseCurrency, type Currency } from './calc'
import { ensureFinanceSeeded } from './seed'

/** Seeds the built-in categories on first open (idempotent, best-effort). */
export function useFinanceSeed(): void {
  useEffect(() => {
    ensureFinanceSeeded().catch(() => {
      /* seeding is best-effort */
    })
  }, [])
}

/** Currency from `settings['currency']`, KZT by default. */
export function useCurrency(): Currency {
  const value = useLiveQuery(async () => (await db.settings.get(CURRENCY_SETTING_KEY))?.value, [])
  return parseCurrency(value)
}

/** All categories ordered by kind then `sort`. */
export function useCategories(): TxCategory[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.txCategories.toArray()).sort((a, b) =>
        a.kind === b.kind ? a.sort - b.sort : a.kind === 'expense' ? -1 : 1,
      ),
    [],
  )
}
