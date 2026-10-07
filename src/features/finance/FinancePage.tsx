import { EmptyState, PageHeader } from '../../components/ui'

export function FinancePage() {
  return (
    <>
      <PageHeader title="Финансы" back="/growth" />
      <EmptyState title="Раздел в разработке" />
    </>
  )
}
