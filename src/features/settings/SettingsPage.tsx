import { EmptyState, PageHeader } from '../../components/ui'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Настройки" back="/" />
      <EmptyState title="Профиль и настройки в разработке" />
    </>
  )
}
