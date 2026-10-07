import { Outlet } from 'react-router'
import { PageHeader, SegmentedNav, type SegmentLink } from '../../components/ui'

const tabs: SegmentLink[] = [
  { to: '/progress', label: 'Вес' },
  { to: '/progress/measurements', label: 'Замеры' },
  { to: '/progress/load', label: 'Нагрузка' },
  { to: '/progress/records', label: 'Рекорды' },
  { to: '/progress/streak', label: 'Серия' },
]

export function ProgressPage() {
  return (
    <>
      <PageHeader title="Прогресс" subtitle="Вес, замеры, нагрузка, рекорды и регулярность" />
      <SegmentedNav aria-label="Разделы прогресса" items={tabs} />
      <Outlet />
    </>
  )
}
