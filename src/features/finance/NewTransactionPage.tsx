import { useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '../../components/ui'
import { db } from '../../db'
import type { TxKind } from '../../db/types'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import { monthOf } from './calc'
import { TxForm, type TxFormValues } from './components'
import { useCategories, useCurrency, useFinanceSeed } from './hooks'
import { SAVINGS_CATEGORY_ID } from './seed'

/** Most recently used manual category per kind — preselected so a typical expense is amount + «Сохранить». */
function useLastCategories(): Partial<Record<TxKind, string>> | undefined {
  return useLiveQuery(async () => {
    const recent = await db.transactions.orderBy('date').reverse().limit(100).toArray()
    recent.sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
    const out: Partial<Record<TxKind, string>> = {}
    for (const t of recent) {
      if (t.recurringId || t.categoryId === SAVINGS_CATEGORY_ID) continue
      out[t.kind] ??= t.categoryId
    }
    return out
  }, [])
}

/** `/finance/new?kind=expense|income` — quick entry: big amount, icon grid, date, note. */
export function NewTransactionPage() {
  useFinanceSeed()
  const [params] = useSearchParams()
  const kind: TxKind = params.get('kind') === 'income' ? 'income' : 'expense'
  const navigate = useNavigate()
  const currency = useCurrency()
  const categories = useCategories()
  const last = useLastCategories()

  async function save(v: TxFormValues) {
    await db.transactions.add({
      id: newId(),
      kind: v.kind,
      amount: v.amount,
      categoryId: v.categoryId,
      date: v.date,
      ...(v.note ? { note: v.note } : {}),
      createdAt: new Date().toISOString(),
    })
    const m = monthOf(v.date)
    navigate(m === monthOf(today()) ? '/finance' : `/finance?month=${m}`)
  }

  return (
    <>
      <PageHeader title={kind === 'income' ? 'Новый доход' : 'Новый расход'} back="/finance" />
      {categories && last && (
        <TxForm
          key={kind}
          initial={{ kind }}
          categories={categories}
          currency={currency}
          onSubmit={save}
          autoFocus
          defaultCategory={(k) => last[k]}
        />
      )}
    </>
  )
}
