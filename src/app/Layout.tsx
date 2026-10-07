import { Link, useLocation, useNavigationType, useOutlet } from 'react-router'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { Icon, type IconName } from '../components/icons'
import { useReduceMotion } from '../components/ui/helpers'

type Tab = { to: string; label: string; icon: IconName; prefixes: string[] }

/** Five tabs; sub-sections (cardio, calendar, habits, sleep…) light up their hub tab. */
const tabs: Tab[] = [
  { to: '/', label: 'Сегодня', icon: 'home', prefixes: ['/settings'] },
  { to: '/workouts', label: 'Тренировки', icon: 'dumbbell', prefixes: ['/workouts', '/cardio', '/calendar'] },
  { to: '/nutrition', label: 'Питание', icon: 'utensils', prefixes: ['/nutrition'] },
  {
    to: '/growth',
    label: 'Развитие',
    icon: 'sparkles',
    prefixes: ['/growth', '/habits', '/books', '/mind', '/finance', '/sleep', '/goals'],
  },
  { to: '/progress', label: 'Прогресс', icon: 'chart', prefixes: ['/progress'] },
]

function isTabActive(tab: Tab, pathname: string): boolean {
  if (pathname === tab.to) return true
  return tab.prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function Layout() {
  const location = useLocation()
  const navType = useNavigationType()
  const outlet = useOutlet()
  const reduce = useReduceMotion()
  const back = navType === 'POP'

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
        <main className="flex-1 px-4 pt-[calc(var(--safe-top)+16px)] pb-[calc(var(--safe-bottom)+96px)]">
          {reduce ? (
            outlet
          ) : (
            <AnimatePresence mode="wait" initial={false} onExitComplete={() => window.scrollTo(0, 0)}>
              <motion.div
                key={location.pathname}
                initial={back ? { opacity: 0, x: -16 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, x: 0, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
                exit={{ opacity: 0, transition: { duration: 0.1, ease: 'easeIn' } }}
              >
                {outlet}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
        <nav
          aria-label="Основная навигация"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-bg/80 pb-safe backdrop-blur-xl backdrop-saturate-150"
        >
          <ul className="mx-auto grid max-w-3xl grid-cols-5 px-1">
            {tabs.map((t) => {
              const active = isTabActive(t, location.pathname)
              return (
                <li key={t.to}>
                  <Link
                    to={t.to}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl pt-1.5 pb-1 text-[11px] font-medium transition-colors ${
                      active ? 'text-accent' : 'text-muted hover:text-text'
                    }`}
                  >
                    <span className="relative grid h-8 w-14 place-items-center">
                      {active && (
                        <motion.span
                          layoutId="nav-pill"
                          className="absolute inset-0 rounded-full bg-accent/15"
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        />
                      )}
                      <motion.span
                        className="relative"
                        animate={active && !reduce ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                        transition={{ duration: 0.32, ease: 'easeOut' }}
                      >
                        <Icon name={t.icon} size={22} strokeWidth={active ? 2 : 1.75} />
                      </motion.span>
                    </span>
                    <span className="leading-none">{t.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </MotionConfig>
  )
}
