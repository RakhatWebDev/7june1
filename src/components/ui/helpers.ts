import { useReducedMotion } from 'motion/react'

/* Domain colour tones shared by primitives and features.
 * accent = gym · info = cardio · warn = nutrition · violet = sleep/mind ·
 * pink = habits · amber = books/finance · danger = errors · muted = neutral.
 * Class strings are spelled out in full so Tailwind can see them. */

export type Tone = 'accent' | 'info' | 'warn' | 'violet' | 'pink' | 'amber' | 'danger' | 'muted'

/** Text colour of a tone. */
export const TONE_TEXT: Record<Tone, string> = {
  accent: 'text-accent',
  info: 'text-info',
  warn: 'text-warn',
  violet: 'text-violet',
  pink: 'text-pink',
  amber: 'text-amber',
  danger: 'text-danger',
  muted: 'text-muted',
}

/** Solid background of a tone (progress fills, dots). */
export const TONE_BG: Record<Tone, string> = {
  accent: 'bg-accent',
  info: 'bg-info',
  warn: 'bg-warn',
  violet: 'bg-violet',
  pink: 'bg-pink',
  amber: 'bg-amber',
  danger: 'bg-danger',
  muted: 'bg-muted',
}

/** Soft tinted background + tone text (icon badges, chips). */
export const TONE_SOFT: Record<Tone, string> = {
  accent: 'bg-accent/15 text-accent',
  info: 'bg-info/15 text-info',
  warn: 'bg-warn/15 text-warn',
  violet: 'bg-violet/15 text-violet',
  pink: 'bg-pink/15 text-pink',
  amber: 'bg-amber/15 text-amber',
  danger: 'bg-danger/15 text-danger',
  muted: 'bg-surface-3 text-muted',
}

/** CSS colour value of a tone, for SVG strokes and inline gradients. */
export const TONE_VAR: Record<Tone, string> = {
  accent: 'var(--color-accent)',
  info: 'var(--color-info)',
  warn: 'var(--color-warn)',
  violet: 'var(--color-violet)',
  pink: 'var(--color-pink)',
  amber: 'var(--color-amber)',
  danger: 'var(--color-danger)',
  muted: 'var(--color-muted)',
}

/** `color-mix` tint of a tone at `pct` % opacity. */
export const toneTint = (tone: Tone, pct: number) => `color-mix(in srgb, ${TONE_VAR[tone]} ${pct}%, transparent)`

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-bg font-semibold hover:bg-accent-strong shadow-[0_10px_24px_-14px_rgb(180_240_60/0.8)]',
  secondary: 'bg-surface-2 text-text hover:bg-surface-3 border border-white/[0.05]',
  ghost: 'bg-transparent text-muted hover:text-text hover:bg-surface-2',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
}

const buttonSizeClass: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-10 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
}

/**
 * Class string of the shared Button look — use it to style a router `<Link>` as a button
 * (`<Link className={buttonClasses({ variant: 'primary' })}>`), or use `LinkButton`.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className = '',
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return `inline-flex select-none items-center justify-center gap-2 rounded-xl transition-[background-color,color,transform,box-shadow] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100 ${buttonVariantClass[variant]} ${buttonSizeClass[size]} ${className}`
}

export type { ButtonVariant, ButtonSize }

/** `true` when the user asked for reduced motion (also true in tests, see src/test/setup.ts). */
export function useReduceMotion(): boolean {
  return !!useReducedMotion()
}
