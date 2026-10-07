import { NavLink, Outlet } from 'react-router'

const tabs = [
  { to: '/', label: 'Сегодня', icon: '◎', end: true },
  { to: '/workouts', label: 'Зал', icon: '🏋' },
  { to: '/cardio', label: 'Кардио', icon: '🏃' },
  { to: '/nutrition', label: 'Питание', icon: '🥗' },
  { to: '/sleep', label: 'Сон', icon: '🌙' },
  { to: '/progress', label: 'Прогресс', icon: '📈' },
]

export function Layout() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
      <main className="flex-1 px-4 pt-4 pb-24">
        <Outlet />
      </main>
      <nav
        aria-label="Основная навигация"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-6">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                    isActive ? 'text-accent' : 'text-muted hover:text-text'
                  }`
                }
              >
                <span aria-hidden className="text-lg leading-none">
                  {t.icon}
                </span>
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
