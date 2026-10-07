import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, StatTile } from '../../components/ui'
import { Icon } from '../../components/icons'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { dailyAllowance, formatMoney, monthBudget, monthOf, monthRange, monthTotals, remainingDays, spentOn } from './calc'
import { linkBtn } from './components'
import { useCurrency } from './hooks'

/** Dashboard card: spent today, what is left of the month's budget, quick «+ Расход». */
export function FinanceTodayCard({ compact = false }: { compact?: boolean }) {
  const date = today()
  const month = monthOf(date)
  const { from, to } = monthRange(month)
  const currency = useCurrency()
  const data = useLiveQuery(async () => {
    const [txs, budgets] = await Promise.all([
      db.transactions.where('date').between(from, to, true, true).toArray(),
      db.budgets.toArray(),
    ])
    return { txs, budgets }
  }, [from, to])

  const fmt = (n: number) => formatMoney(n, currency)
  const txs = data?.txs ?? []
  const totals = monthTotals(txs, month)
  const budget = monthBudget(data?.budgets ?? [], totals.income)
  const left = budget - totals.expense
  const perDay = dailyAllowance(budget, totals.expense, remainingDays(month, date))

  if (compact) {
    return (
      <StatTile
        icon="wallet"
        tone="amber"
        label="Финансы"
        to="/finance"
        value={<span data-testid="finance-today-spent">{fmt(spentOn(txs, date))}</span>}
        sub={
          budget > 0 ? (
            <span className={left < 0 ? 'text-danger' : ''}>
              остаток <span data-testid="finance-today-left">{fmt(left)}</span>
            </span>
          ) : (
            'потрачено сегодня'
          )
        }
        action={
          <Link
            to="/finance/new?kind=expense"
            aria-label="Добавить расход"
            className="grid size-8 place-items-center rounded-full bg-amber/15 text-amber transition active:scale-95"
          >
            <Icon name="plus" size={16} />
          </Link>
        }
      />
    )
  }
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Link to="/finance" className="font-semibold hover:text-accent">
          Финансы
        </Link>
        {perDay != null && perDay > 0 && <span className="text-xs text-muted">≈ {fmt(perDay)} в день</span>}
      </div>
      <div className="flex items-end gap-3">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted">Потрачено сегодня</div>
            <div className="text-lg font-semibold tabular-nums" data-testid="finance-today-spent">
              {fmt(spentOn(txs, date))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Остаток бюджета</div>
            <div
              className={`text-lg font-semibold tabular-nums ${budget > 0 && left < 0 ? 'text-danger' : ''}`}
              data-testid="finance-today-left"
            >
              {budget > 0 ? fmt(left) : '—'}
            </div>
          </div>
        </div>
        <Link to="/finance/new?kind=expense" className={`${linkBtn} shrink-0`}>
          + Расход
        </Link>
      </div>
    </Card>
  )
}
