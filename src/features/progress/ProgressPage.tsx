import { EmptyState, PageHeader } from '../../components/ui'

export function ProgressPage() {
  return (
    <>
      <PageHeader title="Прогресс" />
      <EmptyState title="Раздел в разработке" hint="Здесь появится Прогресс." />
    </>
  )
}
