import { SegmentedNav } from './ui'

/** Sub-sections of the «Тренировки» tab — shown at the top of each of these pages. */
export function WorkoutsNav() {
  return (
    <SegmentedNav
      aria-label="Разделы тренировок"
      items={[
        { to: '/workouts', label: 'Зал' },
        { to: '/cardio', label: 'Кардио' },
        { to: '/cardio/stretch', label: 'Растяжка' },
        { to: '/calendar', label: 'Календарь' },
        { to: '/workouts/history', label: 'История' },
      ]}
    />
  )
}
