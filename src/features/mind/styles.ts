import type { IconName } from '../../components/icons'
import { buttonClasses, type Tone } from '../../components/ui/helpers'
import type { JournalKind, MindKind } from './calc'

/** Link styles matching the shared Button variants (for plain router links). */
export const linkPrimary = buttonClasses({ variant: 'primary' })
export const linkSecondary = buttonClasses({ variant: 'secondary' })

export const textareaClass =
  'w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-base text-text placeholder:text-muted/70 transition-[border-color,box-shadow] focus:border-violet/70 focus:outline-none focus:ring-2 focus:ring-violet/20'

/** Icon + tone of each practice kind (lists, badges). */
export const MIND_KIND_BADGE: Record<MindKind, { icon: IconName; tone: Tone }> = {
  meditation: { icon: 'brain', tone: 'violet' },
  breathing: { icon: 'wind', tone: 'info' },
  prayer: { icon: 'sparkles', tone: 'amber' },
  reading_spiritual: { icon: 'book', tone: 'amber' },
}

/** Icon + tone of each journal entry kind. */
export const JOURNAL_KIND_BADGE: Record<JournalKind, { icon: IconName; tone: Tone }> = {
  gratitude: { icon: 'heart', tone: 'pink' },
  reflection: { icon: 'brain', tone: 'violet' },
  evening_review: { icon: 'moon', tone: 'violet' },
  free: { icon: 'edit', tone: 'warn' },
}

/** Icons of the three evening-review prompts (wins · improve · tomorrow). */
export const REVIEW_BADGES: { icon: IconName; tone: Tone }[] = [
  { icon: 'trophy', tone: 'accent' },
  { icon: 'activity', tone: 'warn' },
  { icon: 'target', tone: 'violet' },
]

export const EASE_OUT = [0.22, 1, 0.36, 1] as const
export const SPRING = { type: 'spring', stiffness: 300, damping: 26 } as const

/** Fade-up entrance for the `i`-th list item (40 ms stagger, capped at 10); none under reduced motion. */
export function staggerItem(i: number, reduce: boolean) {
  return {
    initial: reduce ? (false as const) : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.32, ease: EASE_OUT, delay: Math.min(i, 9) * 0.04 },
  }
}
