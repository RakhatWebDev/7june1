import type { RouteObject } from 'react-router'
import { BudgetsPage } from './BudgetsPage'
import { FinancePage } from './FinancePage'
import { NewTransactionPage } from './NewTransactionPage'
import { RecurringPage } from './RecurringPage'
import { SavingsPage } from './SavingsPage'

export const financeRoutes: RouteObject[] = [
  { path: 'finance', element: <FinancePage /> },
  { path: 'finance/new', element: <NewTransactionPage /> },
  { path: 'finance/budgets', element: <BudgetsPage /> },
  { path: 'finance/recurring', element: <RecurringPage /> },
  { path: 'finance/savings', element: <SavingsPage /> },
]
