import { EmptyState, PageHeader } from '../../components/ui'

export function WorkoutsPage() {
  return (
    <>
      <PageHeader title="Зал" />
      <EmptyState title="Раздел в разработке" hint="Здесь появится Зал." />
    </>
  )
}
