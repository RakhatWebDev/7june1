import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { FinanceTodayCard } from './cards'
import { monthOf } from './calc'
import { financeRoutes } from './routes'
import { SAVINGS_CATEGORY_ID, ensureFinanceSeeded } from './seed'

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [...financeRoutes, { path: 'card', element: <FinanceTodayCard /> }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const D = today()
const M = monthOf(D)

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await ensureFinanceSeeded()
})

describe('NewTransactionPage', () => {
  it('saves an expense with amount, category tap and «Сохранить»', async () => {
    const user = userEvent.setup()
    const router = renderAt('/finance/new?kind=expense')
    const amount = await screen.findByLabelText('Сумма')
    expect(amount).toHaveAttribute('inputmode', 'decimal')
    await user.type(amount, '2 500')
    const save = screen.getByRole('button', { name: 'Сохранить' })
    expect(save).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Еда/ }))
    await user.click(save)

    await waitFor(async () => expect(await db.transactions.count()).toBe(1))
    expect((await db.transactions.toArray())[0]).toMatchObject({
      kind: 'expense',
      amount: 2500,
      categoryId: 'cat-food',
      date: D,
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/finance'))
  })

  it('preselects the last used category so a typical expense is amount + save', async () => {
    await db.transactions.add({ id: 'p', kind: 'expense', amount: 1, categoryId: 'cat-transport', date: D, createdAt: 'x' })
    const user = userEvent.setup()
    renderAt('/finance/new?kind=expense')
    await user.type(await screen.findByLabelText('Сумма'), '300')
    expect(screen.getByRole('button', { name: /Транспорт/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(2))
    const added = (await db.transactions.toArray()).find((t) => t.id !== 'p')
    expect(added).toMatchObject({ amount: 300, categoryId: 'cat-transport' })
  })

  it('income kind shows income categories', async () => {
    renderAt('/finance/new?kind=income')
    expect(await screen.findByRole('heading', { name: 'Новый доход' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Зарплата/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Транспорт/ })).not.toBeInTheDocument()
  })
})

describe('FinancePage', () => {
  it('shows month totals, category breakdown and edits/deletes an operation', async () => {
    await db.transactions.bulkAdd([
      { id: 'i', kind: 'income', amount: 300_000, categoryId: 'cat-salary', date: `${M}-01`, createdAt: '1' },
      { id: 'e1', kind: 'expense', amount: 20_000, categoryId: 'cat-food', date: D, createdAt: '2' },
      { id: 'e2', kind: 'expense', amount: 5_000, categoryId: 'cat-transport', date: D, createdAt: '3' },
    ])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderAt('/finance')

    const summary = await screen.findByRole('region', { name: 'Сводка месяца' })
    await within(summary).findByText(`300 000 ₸`)
    expect(within(summary).getByText(`25 000 ₸`)).toBeInTheDocument()
    expect(within(summary).getByText(`275 000 ₸`)).toBeInTheDocument()
    expect(screen.getByTestId('daily-allowance').textContent).not.toBe('—')

    const breakdown = screen.getByRole('list', { name: 'Расходы по категориям' })
    expect(within(breakdown).getByText('80%')).toBeInTheDocument()
    expect(within(breakdown).getByText('20%')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Операция Еда 20\s000\s₸$/ }))
    const dialog = screen.getByRole('dialog', { name: 'Операция' })
    const amount = within(dialog).getByLabelText('Сумма')
    await user.clear(amount)
    await user.type(amount, '18000')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(async () => expect((await db.transactions.get('e1'))?.amount).toBe(18_000))

    await user.click(await screen.findByRole('button', { name: /^Операция Транспорт 5\s000\s₸$/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
    await waitFor(async () => expect(await db.transactions.get('e2')).toBeUndefined())
  })

  it('switches months and uses the currency setting', async () => {
    await db.settings.put({ key: 'currency', value: 'USD' })
    await db.transactions.add({ id: 'x', kind: 'income', amount: 1500, categoryId: 'cat-salary', date: `${M}-01`, createdAt: '1' })
    const user = userEvent.setup()
    renderAt('/finance')
    expect(await screen.findAllByText(`1 500 $`)).not.toHaveLength(0)
    const label = screen.getByTestId('finance-month').textContent
    await user.click(screen.getByRole('button', { name: 'Предыдущий месяц' }))
    expect(screen.getByTestId('finance-month').textContent).not.toBe(label)
    expect(await screen.findByText('Операций за месяц нет')).toBeInTheDocument()
  })
})

describe('BudgetsPage', () => {
  it('shows spent / limit with warn colour above 80 % and sets a new limit', async () => {
    await db.budgets.add({ id: 'b', categoryId: 'cat-food', monthlyLimit: 10_000 })
    await db.transactions.add({ id: 'e', kind: 'expense', amount: 9_000, categoryId: 'cat-food', date: D, createdAt: '1' })
    const user = userEvent.setup()
    renderAt('/finance/budgets')

    const bar = await screen.findByRole('progressbar', { name: 'Еда' })
    expect(bar).toHaveAttribute('data-level', 'warn')
    expect(bar).toHaveAttribute('aria-valuenow', '90')

    await user.click(screen.getByRole('button', { name: 'Лимит: Транспорт' }))
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Лимит в месяц'), '20000')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('progressbar', { name: 'Транспорт' })).toHaveAttribute('data-level', 'ok')
    expect(await screen.findByRole('progressbar', { name: 'Общий бюджет' })).toHaveAttribute('aria-valuenow', '30')
  })
})

describe('RecurringPage', () => {
  it('adds a payment, shows totals and posts it once for the month', async () => {
    const user = userEvent.setup()
    renderAt('/finance/recurring')
    await user.click(await screen.findByRole('button', { name: 'Добавить платёж' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Название'), 'OneFit')
    await user.type(within(dialog).getByLabelText('Сумма'), '25000')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByTestId('recurring-monthly')).toHaveTextContent(`25 000 ₸`)
    expect(screen.getByTestId('recurring-yearly')).toHaveTextContent(`300 000 ₸`)

    await user.click(screen.getByRole('button', { name: 'Провести за этот месяц' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Проведено платежей: 1')
    const txs = await db.transactions.toArray()
    expect(txs).toHaveLength(1)
    expect(txs[0].recurringId).toBeTruthy()
    expect(txs[0].date.startsWith(M)).toBe(true)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Провести за этот месяц' })).toBeDisabled())
  })
})

describe('SavingsPage', () => {
  it('creates a goal and tops it up, recording a «Накопления» expense', async () => {
    const user = userEvent.setup()
    renderAt('/finance/savings')
    await user.click((await screen.findAllByRole('button', { name: /Цель|Создать цель/ }))[0])
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Название'), 'Подушка')
    await user.type(within(dialog).getByLabelText(/Цель, ₸/), '100000')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    await user.click(await screen.findByRole('button', { name: 'Пополнить Подушка' }))
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Сумма'), '25000')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Пополнить' }))

    await waitFor(async () => expect((await db.savingsGoals.toArray())[0]?.savedAmount).toBe(25_000))
    const [t] = await db.transactions.toArray()
    expect(t).toMatchObject({ kind: 'expense', amount: 25_000, categoryId: SAVINGS_CATEGORY_ID, date: D })
    expect(await screen.findByText('25%')).toBeInTheDocument()
  })
})

describe('FinanceTodayCard', () => {
  it('shows spent today and the remaining month budget', async () => {
    await db.budgets.add({ id: 'b', categoryId: 'cat-food', monthlyLimit: 50_000 })
    await db.transactions.add({ id: 'e', kind: 'expense', amount: 4_000, categoryId: 'cat-food', date: D, createdAt: '1' })
    renderAt('/card')
    await waitFor(() => expect(screen.getByTestId('finance-today-spent')).toHaveTextContent(`4 000 ₸`))
    expect(screen.getByTestId('finance-today-left')).toHaveTextContent(`46 000 ₸`)
    expect(screen.getByRole('link', { name: '+ Расход' })).toHaveAttribute('href', '/finance/new?kind=expense')
  })
})
