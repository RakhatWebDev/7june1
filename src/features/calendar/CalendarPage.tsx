import { EmptyState, PageHeader } from '../../components/ui'

export function CalendarPage() {
  return (
    <>
      <PageHeader title="Календарь" back="/" />
      <EmptyState title="Раздел в разработке" hint="Занятия OneFit из календаря." />
    </>
  )
}
