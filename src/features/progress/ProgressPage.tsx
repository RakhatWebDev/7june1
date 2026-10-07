import { NavLink, Outlet } from 'react-router'
import { PageHeader } from '../../components/ui'

const tabs = [
  { to: '/progress', label: 'Вес', end: true },
  { to: '/progress/measurements', label: 'Замеры' },
  { to: '/progress/load', label: 'Нагрузка' },
  { to: '/progress/records', label: 'Рекорды' },
  { to: '/progress/streak', label: 'Серия' },
]

export function ProgressPage() {
  return (
    <>
      <PageHeader title="Прогресс" subtitle="Вес, замеры, нагрузка, рекорды и регулярность" />
      <nav aria-label="Разделы прогресса" className="-mx-4 mb-4 overflow-x-auto px-4">
        <ul className="flex gap-2 whitespace-nowrap">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `inline-block rounded-full border px-3 py-1.5 text-sm ${
                    isActive
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border bg-surface-2 text-muted hover:text-text'
                  }`
                }
              >
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  )
}
