import { EmptyState, PageHeader } from '../../components/ui'

export function TodayPage() {
  return (
    <>
      <PageHeader title="Сегодня" />
      <EmptyState title="Дашборд дня в разработке" hint="Тренировка дня, питание, вода, сон." />
    </>
  )
}
