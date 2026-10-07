import { EmptyState, PageHeader } from '../../components/ui'

export function GoalsPage() {
  return (
    <>
      <PageHeader title="Цели" back="/growth" />
      <EmptyState title="Раздел в разработке" />
    </>
  )
}
