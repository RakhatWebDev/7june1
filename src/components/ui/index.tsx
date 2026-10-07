import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, type LinkProps } from 'react-router'
import { AnimatePresence, animate, motion, useDragControls, type Variants } from 'motion/react'
import { Icon, type IconName } from '../icons'
import {
  buttonClasses,
  TONE_BG,
  TONE_SOFT,
  TONE_TEXT,
  TONE_VAR,
  toneTint,
  useReduceMotion,
  type ButtonSize,
  type ButtonVariant,
  type Tone,
} from './helpers'

export { TONE_BG, TONE_SOFT, TONE_TEXT, TONE_VAR, type Tone }
export { Icon, type IconName } from '../icons'

/* ------------------------------------------------------------------ */
/* Shared UI primitives. Features compose these instead of inventing   */
/* new buttons/cards. Motion: 180–320 ms, spring 300/26; everything    */
/* falls back to a static render under prefers-reduced-motion.         */
/* ------------------------------------------------------------------ */

const SPRING = { type: 'spring', stiffness: 300, damping: 26 } as const
const EASE_OUT = [0.22, 1, 0.36, 1] as const


/** Icon given either by name or as a ready node. */
function renderIcon(icon: IconName | ReactNode | undefined, size: number) {
  if (icon == null || icon === false) return null
  return typeof icon === 'string' ? <Icon name={icon as IconName} size={size} /> : icon
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="animate-spin motion-reduce:animate-none"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}

/* ------------------------------ Button ----------------------------- */

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  icon,
  iconRight,
  loading = false,
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Leading icon: an `IconName` or any node. */
  icon?: IconName | ReactNode
  /** Trailing icon: an `IconName` or any node. */
  iconRight?: IconName | ReactNode
  /** Shows a spinner instead of the leading icon and disables the button. */
  loading?: boolean
}) {
  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 16 : 18
  return (
    <button
      type="button"
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : renderIcon(icon, iconSize)}
      {children}
      {renderIcon(iconRight, iconSize)}
    </button>
  )
}

/** A router `<Link>` that looks like a `Button` (same variants, sizes and icons). */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  className = '',
  icon,
  iconRight,
  children,
  ...rest
}: LinkProps & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName | ReactNode
  iconRight?: IconName | ReactNode
}) {
  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 16 : 18
  return (
    <Link className={buttonClasses({ variant, size, className })} {...rest}>
      {renderIcon(icon, iconSize)}
      {children}
      {renderIcon(iconRight, iconSize)}
    </Link>
  )
}

/* ------------------------------- Card ------------------------------ */

export type CardVariant = 'default' | 'elevated' | 'glass' | 'accent'

const cardVariantClass: Record<CardVariant, string> = {
  default: 'border-white/[0.06] bg-surface bg-[image:var(--gradient-surface)] shadow-[var(--shadow-card)]',
  elevated: 'border-white/[0.08] bg-surface-2 bg-[image:var(--gradient-elevated)] shadow-[var(--shadow-float)]',
  glass: 'border-white/10 bg-surface/60 backdrop-blur-xl shadow-[var(--shadow-card)]',
  accent: 'border-white/[0.08] bg-surface shadow-[var(--shadow-card)]',
}

/** Background image for a tinted card: a soft glow of the tone in the top-right corner. */
function toneGlow(tone: Tone, strong: boolean): string {
  return `radial-gradient(130% 120% at 100% 0%, ${toneTint(tone, strong ? 30 : 12)} 0%, ${toneTint(tone, strong ? 8 : 3)} 45%, transparent 75%), var(--gradient-surface)`
}

const cardPaddingClass = { none: 'p-0', sm: 'p-3', md: 'p-4' } as const

export function Card({
  children,
  className = '',
  as: Tag = 'section',
  variant = 'default',
  tone,
  padding = 'md',
  style,
  ...rest
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article' | 'li'
  /** Inner padding: none (list containers), sm, md (default). */
  padding?: 'none' | 'sm' | 'md'
  /** default — surface + hairline; elevated — lifted surface-2; glass — translucent blur; accent — tone gradient hero. */
  variant?: CardVariant
  /** Domain tone: tints the card with a corner glow (strong for `accent` variant; default lime). */
  tone?: Tone
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>) {
  const glowTone = tone ?? (variant === 'accent' ? 'accent' : undefined)
  const bg: CSSProperties | undefined = glowTone
    ? { backgroundImage: toneGlow(glowTone, variant === 'accent'), ...style }
    : style
  return (
    <Tag
      className={`rounded-3xl border ${cardPaddingClass[padding]} ${cardVariantClass[variant]} ${className}`}
      style={bg}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/* ---------------------------- PageHeader --------------------------- */

export function PageHeader({
  title,
  subtitle,
  action,
  back,
  eyebrow,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  back?: string
  /** Small caps line above the title (e.g. date). */
  eyebrow?: ReactNode
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link
            to={back}
            className="-ml-1.5 mb-1 inline-flex items-center gap-0.5 rounded-lg py-0.5 pr-2 text-sm text-muted transition-colors hover:text-text"
          >
            <Icon name="chevron-left" size={18} />
            Назад
          </Link>
        )}
        {eyebrow && <div className="text-xs font-medium tracking-wide text-muted uppercase">{eyebrow}</div>}
        <h1 className="truncate text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

/* --------------------------- SectionHeader ------------------------- */

/** Heading for a group of cards inside a page: optional tinted icon and a trailing action/link. */
export function SectionHeader({
  title,
  subtitle,
  icon,
  tone = 'muted',
  action,
  className = '',
  as: Tag = 'h2',
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: IconName
  tone?: Tone
  action?: ReactNode
  className?: string
  as?: 'h2' | 'h3'
}) {
  return (
    <div className={`mt-6 mb-2.5 flex items-end justify-between gap-3 px-0.5 ${className}`}>
      <div className="min-w-0">
        <Tag className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          {icon && <Icon name={icon} size={18} className={TONE_TEXT[tone]} />}
          <span className="truncate">{title}</span>
        </Tag>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 text-sm">{action}</div>}
    </div>
  )
}

/** Rounded square with a tinted background holding an icon (list rows, hub cards, tiles). */
export function IconBadge({
  name,
  tone = 'accent',
  size = 'md',
  className = '',
}: {
  name: IconName
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const box = size === 'sm' ? 'size-7 rounded-lg' : size === 'lg' ? 'size-12 rounded-2xl' : 'size-9 rounded-xl'
  const px = size === 'sm' ? 16 : size === 'lg' ? 24 : 19
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center ${box} ${TONE_SOFT[tone]} ${className}`}>
      <Icon name={name} size={px} />
    </span>
  )
}

/* ------------------------------ Fields ----------------------------- */

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-base text-text placeholder:text-muted/70 transition-[border-color,box-shadow] focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/20'

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...rest} />
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${inputClass} ${className}`} {...rest} />
}

/* ------------------------------ Stepper ---------------------------- */

/** Numeric stepper for weight/reps; `step` may be fractional (2.5 kg). The value slides up/down on ± taps. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  suffix,
  'aria-label': ariaLabel,
}: {
  value: number | null
  onChange: (v: number | null) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  'aria-label'?: string
}) {
  const reduce = useReduceMotion()
  // `bump` changes only on ± taps so typing in the input never remounts it.
  const [bump, setBump] = useState({ n: 0, dir: 1 })
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min, v))
  const round = (v: number) => Number(v.toFixed(2))
  const nudge = (dir: 1 | -1) => {
    setBump((b) => ({ n: b.n + 1, dir }))
    onChange(round(clamp((value ?? 0) + dir * step)))
  }
  const inputProps = {
    type: 'number',
    inputMode: 'decimal' as const,
    'aria-label': ariaLabel,
    className: 'w-16 bg-transparent text-center text-base font-semibold tabular-nums focus:outline-none',
    value: value ?? '',
    step,
    min,
    max,
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      onChange(e.target.value === '' ? null : round(clamp(Number(e.target.value)))),
  }
  const btn =
    'grid w-10 place-items-center text-muted transition-colors hover:bg-surface-3 hover:text-text active:bg-border'
  return (
    <div className="relative flex min-h-11 items-stretch overflow-hidden rounded-xl border border-border bg-surface-2">
      <button type="button" aria-label="Меньше" className={btn} onClick={() => nudge(-1)}>
        <Icon name="minus" size={18} />
      </button>
      {reduce ? (
        <input {...inputProps} />
      ) : (
        <AnimatePresence initial={false} mode="popLayout" custom={bump.dir}>
          <motion.input
            key={bump.n}
            {...inputProps}
            custom={bump.dir}
            variants={{
              enter: (d: number) => ({ y: d > 0 ? 14 : -14, opacity: 0 }),
              center: { y: 0, opacity: 1 },
              exit: (d: number) => ({ y: d > 0 ? -14 : 14, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.18, ease: EASE_OUT }}
          />
        </AnimatePresence>
      )}
      {suffix && <span className="self-center pr-1 text-xs text-muted">{suffix}</span>}
      <button type="button" aria-label="Больше" className={btn} onClick={() => nudge(1)}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  )
}

/* ---------------------------- EmptyState --------------------------- */

export function EmptyState({
  title,
  hint,
  action,
  icon = 'sparkles',
  tone = 'accent',
}: {
  title: string
  hint?: string
  action?: ReactNode
  /** Illustrative icon (breathes gently unless reduced motion). */
  icon?: IconName
  tone?: Tone
}) {
  const reduce = useReduceMotion()
  return (
    <div className="rounded-3xl border border-dashed border-border bg-surface/40 px-6 py-8 text-center">
      <motion.span
        aria-hidden
        className={`mx-auto mb-3 grid size-14 place-items-center rounded-2xl ${TONE_SOFT[tone]}`}
        animate={reduce ? undefined : { scale: [1, 1.04, 1] }}
        transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Icon name={icon} size={26} />
      </motion.span>
      <p className="font-semibold tracking-tight">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ------------------------------- Stat ------------------------------ */

export function Stat({
  label,
  value,
  sub,
  icon,
  tone = 'muted',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: IconName
  tone?: Tone
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface bg-[image:var(--gradient-surface)] p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon && <Icon name={icon} size={14} className={TONE_TEXT[tone]} />}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

/**
 * Compact dashboard tile: tinted icon + label, big value, one line of context.
 * `to` makes the whole tile a link (the `action` stays separately clickable above it).
 */
export function StatTile({
  icon,
  tone = 'accent',
  label,
  value,
  unit,
  sub,
  to,
  action,
  className = '',
  'data-testid': testId,
}: {
  icon: IconName
  tone?: Tone
  label: string
  value: ReactNode
  unit?: ReactNode
  sub?: ReactNode
  to?: string
  action?: ReactNode
  className?: string
  'data-testid'?: string
}) {
  return (
    <Card as="div" className={`relative flex flex-col p-3 ${className}`} data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-h-8 min-w-0 items-center gap-1.5">
          <Icon name={icon} size={17} className={TONE_TEXT[tone]} />
          {to ? (
            <Link
              to={to}
              className="truncate text-[13px] font-medium text-muted transition-colors before:absolute before:inset-0 before:rounded-3xl before:content-[''] hover:text-text"
            >
              {label}
            </Link>
          ) : (
            <span className="truncate text-[13px] font-medium text-muted">{label}</span>
          )}
        </span>
        {action && <span className="relative z-10 shrink-0">{action}</span>}
      </div>
      <div className="mt-auto pt-2">
        <div className="flex items-baseline gap-1 text-[22px] leading-tight font-semibold tracking-tight tabular-nums">
          {value}
          {unit && <span className="text-sm font-medium text-muted">{unit}</span>}
        </div>
        {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
      </div>
    </Card>
  )
}

/* ------------------------------- Chip ------------------------------ */

export function Chip({
  children,
  active = false,
  onClick,
  className = '',
  icon,
  tone = 'accent',
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
  icon?: IconName | ReactNode
  /** Colour when active. */
  tone?: Tone
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-95 motion-reduce:active:scale-100 ${
        active
          ? `border-transparent ${TONE_SOFT[tone]} ring-1 ring-current/40`
          : 'border-border bg-surface-2 text-muted hover:border-surface-3 hover:text-text'
      } ${className}`}
    >
      {renderIcon(icon, 14)}
      {children}
    </button>
  )
}

/* --------------------------- SegmentedControl ---------------------- */

export type SegmentOption<T extends string> = { value: T; label: ReactNode; icon?: IconName }

/** iOS-style segmented control: a sliding thumb (shared `layoutId`) marks the selected option. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  size = 'md',
  className = '',
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
  'aria-label': string
  size?: 'sm' | 'md'
  className?: string
}) {
  const id = useId()
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`flex gap-1 rounded-2xl border border-white/[0.05] bg-surface-2/80 p-1 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 font-medium whitespace-nowrap transition-colors ${
              size === 'sm' ? 'min-h-8 text-xs' : 'min-h-9 text-sm'
            } ${active ? 'text-text' : 'text-muted hover:text-text'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={SPRING}
                className="absolute inset-0 rounded-xl bg-surface-3 shadow-[0_2px_8px_-2px_rgb(0_0_0/0.5)]"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.icon && <Icon name={o.icon} size={16} />}
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export type SegmentLink = { to: string; label: string; icon?: IconName }

/**
 * Segmented row of router links (hub sub-sections). The item whose `to` equals the current
 * pathname is active; the row scrolls horizontally on narrow screens instead of overflowing.
 */
export function SegmentedNav({
  items,
  'aria-label': ariaLabel,
  className = '',
}: {
  items: SegmentLink[]
  'aria-label': string
  className?: string
}) {
  const { pathname } = useLocation()
  const id = useId()
  return (
    <nav aria-label={ariaLabel} className={`-mx-4 mb-4 overflow-x-auto px-4 no-scrollbar ${className}`}>
      <ul className="flex w-max min-w-full gap-0.5 rounded-2xl border border-white/[0.05] bg-surface-2/80 p-1">
        {items.map((it) => {
          const active = pathname === it.to
          return (
            <li key={it.to} className="flex-1">
              <Link
                to={it.to}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-2 text-xs sm:px-3 sm:text-[13px] font-medium whitespace-nowrap transition-colors ${
                  active ? 'text-text' : 'text-muted hover:text-text'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId={`segnav-${id}`}
                    transition={SPRING}
                    className="absolute inset-0 rounded-xl bg-surface-3 shadow-[0_2px_8px_-2px_rgb(0_0_0/0.5)]"
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  {it.icon && <Icon name={it.icon} size={16} />}
                  {it.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/* ------------------------------- Sheet ----------------------------- */

const sheetVariants: Variants = { hidden: {}, visible: {} }
const backdropVariants: Variants = {
  hidden: { opacity: 0, transition: { duration: 0.2 } },
  visible: { opacity: 1, transition: { duration: 0.22 } },
}
const panelVariants: Variants = {
  hidden: { y: '100%', transition: { type: 'spring', stiffness: 400, damping: 40 } },
  visible: { y: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } },
}

/**
 * Bottom sheet / modal. Renders nothing when closed. Slides up with a spring; drag the
 * handle down (> 120 px or a fast flick) or tap the backdrop / press Esc to close.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  const reduce = useReduceMotion()
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  if (typeof document === 'undefined') return null
  if (reduce) {
    return open
      ? createPortal(
          <SheetFrame title={title} onClose={onClose} animated={false}>
            {children}
          </SheetFrame>,
          document.body,
        )
      : null
  }
  return createPortal(
    <AnimatePresence>
      {open && (
        <SheetFrame key="sheet" title={title} onClose={onClose} animated>
          {children}
        </SheetFrame>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function SheetFrame({
  title,
  onClose,
  animated,
  children,
}: {
  title?: string
  onClose: () => void
  animated: boolean
  children: ReactNode
}) {
  const controls = useDragControls()
  const panelClass =
    'relative max-h-[90vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[28px] border border-b-0 border-white/[0.08] bg-surface-2 bg-[image:var(--gradient-elevated)] px-4 pb-[calc(1rem+var(--safe-bottom))] shadow-[var(--shadow-float)] sm:rounded-[28px] sm:border-b'
  const handle = (
    <div
      className="sticky top-0 z-10 -mx-4 mb-1 flex cursor-grab touch-none justify-center bg-gradient-to-b from-surface-2 via-surface-2/90 to-transparent pt-2.5 pb-2 active:cursor-grabbing"
      onPointerDown={animated ? (e) => controls.start(e) : undefined}
    >
      <span aria-hidden className="h-1.5 w-10 rounded-full bg-surface-3" />
    </div>
  )
  const heading = title && <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>

  if (!animated) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
        <div aria-hidden className="absolute inset-0 bg-black/60" />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={panelClass}
          onClick={(e) => e.stopPropagation()}
        >
          {handle}
          {heading}
          {children}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      variants={sheetVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
    >
      <motion.div
        aria-hidden
        variants={backdropVariants}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={panelClass}
        variants={panelVariants}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 700) onClose()
        }}
      >
        {handle}
        {heading}
        {children}
      </motion.div>
    </motion.div>
  )
}

/* ----------------------------- Progress ---------------------------- */

/** Horizontal progress bar 0..1; the fill grows in on mount and glides on change. */
export function Progress({
  value,
  className = '',
  tone = 'accent',
  'aria-label': ariaLabel,
}: {
  value: number
  className?: string
  tone?: Tone
  'aria-label'?: string
}) {
  const reduce = useReduceMotion()
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100
  const fill = `h-full rounded-full ${TONE_BG[tone]}`
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`h-2 w-full overflow-hidden rounded-full bg-surface-3/70 ${className}`}
    >
      {reduce ? (
        <div className={fill} style={{ width: `${pct}%` }} />
      ) : (
        <motion.div
          className={fill}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        />
      )}
    </div>
  )
}

/* ------------------------------ Skeleton --------------------------- */

/** Shimmering placeholder block; size it with `className` (e.g. `h-4 w-32`). */
export function Skeleton({ className = '', rounded = 'rounded-xl' }: { className?: string; rounded?: string }) {
  return <div aria-hidden className={`skeleton ${rounded} ${className}`} />
}

/* ------------------------------ CountUp ---------------------------- */

const defaultFormat = (n: number) => Math.round(n).toLocaleString('ru-RU')

/** Number that counts up from its previous value (0 on mount) — 600 ms ease-out. */
export function CountUp({
  value,
  duration = 0.6,
  delay = 0,
  format = defaultFormat,
  className,
}: {
  value: number
  duration?: number
  delay?: number
  format?: (n: number) => string
  className?: string
}) {
  const reduce = useReduceMotion()
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (reduce) return
    const controls = animate(from.current, value, {
      duration,
      delay,
      ease: EASE_OUT,
      onUpdate: (v) => {
        from.current = v
        setShown(v)
      },
    })
    return () => controls.stop()
  }, [value, duration, delay, reduce])
  return <span className={`tabular-nums ${className ?? ''}`}>{format(reduce ? value : shown)}</span>
}

/* -------------------------------- Ring ----------------------------- */

/**
 * Activity-style SVG progress ring. `value` 0..1 (clamped); the arc draws in from empty
 * (600 ms, `delay` s) and glides on change. Put a label/number in `children` (centre).
 */
export function Ring({
  value,
  size = 88,
  stroke = 10,
  tone = 'accent',
  delay = 0,
  children,
  'aria-label': ariaLabel,
  className = '',
}: {
  value: number
  size?: number
  stroke?: number
  tone?: Tone
  delay?: number
  children?: ReactNode
  'aria-label'?: string
  className?: string
}) {
  const reduce = useReduceMotion()
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const target = c * (1 - v)
  const common = {
    cx: size / 2,
    cy: size / 2,
    r,
    fill: 'none',
    strokeWidth: stroke,
  }
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle {...common} stroke={toneTint(tone, 16)} />
        {reduce ? (
          <circle
            {...common}
            stroke={TONE_VAR[tone]}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={target}
            opacity={v === 0 ? 0 : 1}
          />
        ) : (
          <>
            {/* Soft glow: a wider, translucent twin of the arc. A CSS drop-shadow filter
                was used before, but Chromium paints its filter region as a faint square. */}
            <motion.circle
              {...common}
              stroke={TONE_VAR[tone]}
              strokeWidth={stroke + 6}
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              animate={{ strokeDashoffset: target, opacity: v === 0 ? 0 : 0.22 }}
              transition={{ duration: 0.6, delay, ease: EASE_OUT }}
            />
            <motion.circle
              {...common}
              stroke={TONE_VAR[tone]}
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              animate={{ strokeDashoffset: target, opacity: v === 0 ? 0 : 1 }}
              transition={{ duration: 0.6, delay, ease: EASE_OUT }}
            />
          </>
        )}
      </svg>
      {children != null && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  )
}

/* ---------------------------- StaggerList -------------------------- */

/**
 * Wraps each child in an item that fades up with a 40 ms stagger (first 10 items; later ones
 * share the 10th delay). `as="ul"` wraps children in `<li>`. Null children are skipped.
 */
export function StaggerList({
  children,
  as = 'div',
  className = '',
  itemClassName = '',
  stagger = 0.04,
  delay = 0,
}: {
  children: ReactNode
  as?: 'div' | 'ul' | 'ol'
  className?: string
  itemClassName?: string
  stagger?: number
  delay?: number
}) {
  const reduce = useReduceMotion()
  const items = Children.toArray(children)
  const Tag = as
  const Item = as === 'div' ? motion.div : motion.li
  return (
    <Tag className={className}>
      {items.map((child, i) => {
        const key = isValidElement(child) && child.key != null ? child.key : i
        if (reduce) {
          const Plain = as === 'div' ? 'div' : 'li'
          return (
            <Plain key={key} className={itemClassName}>
              {child}
            </Plain>
          )
        }
        return (
          <Item
            key={key}
            className={itemClassName}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE_OUT, delay: delay + Math.min(i, 9) * stagger }}
          >
            {child}
          </Item>
        )
      })}
    </Tag>
  )
}

/* ------------------------------ Confetti --------------------------- */

const CONFETTI_COLORS = ['accent', 'info', 'warn', 'violet', 'pink', 'amber'] as const

/** Deterministic pseudo-random 0..1 for particle `i`, `salt`. */
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * A one-shot burst of `count` (24) particles from the centre of the nearest positioned
 * ancestor — 900 ms, then it unmounts itself. Fires once per mount; nothing under reduced motion.
 */
export function Confetti({ count = 24, className = '' }: { count?: number; className?: string }) {
  const reduce = useReduceMotion()
  const [done, setDone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 950)
    return () => clearTimeout(t)
  }, [])
  if (reduce || done) return null
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 z-20 overflow-visible ${className}`}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + rand(i, 1) * 0.5
        const dist = 60 + rand(i, 2) * 90
        const style = {
          '--dx': `${Math.cos(angle) * dist}px`,
          '--dy': `${Math.sin(angle) * dist - 30}px`,
          '--rot': `${Math.round(rand(i, 3) * 720 - 360)}deg`,
          backgroundColor: TONE_VAR[CONFETTI_COLORS[i % CONFETTI_COLORS.length]],
          width: i % 3 === 0 ? 7 : 5,
          height: i % 3 === 0 ? 7 : 10,
          borderRadius: i % 3 === 0 ? 999 : 2,
          animationDelay: `${Math.round(rand(i, 4) * 60)}ms`,
        } as CSSProperties
        return <span key={i} className="confetti-piece absolute top-1/2 left-1/2" style={style} />
      })}
    </div>
  )
}

/* -------------------------------- Toast ---------------------------- */

/**
 * Top badge that springs in from above (e.g. «Новый рекорд»). Controlled by `open`;
 * with `onClose` it auto-dismisses after `duration` ms. Announced politely to screen readers.
 */
export function Toast({
  open,
  children,
  icon = 'trophy',
  tone = 'amber',
  onClose,
  duration = 2800,
}: {
  open: boolean
  children: ReactNode
  icon?: IconName
  tone?: Tone
  onClose?: () => void
  duration?: number
}) {
  const reduce = useReduceMotion()
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open || !onCloseRef.current || duration <= 0) return
    const t = setTimeout(() => onCloseRef.current?.(), duration)
    return () => clearTimeout(t)
  }, [open, duration])
  if (typeof document === 'undefined') return null
  const badge = (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2.5 rounded-full border border-white/10 bg-surface-2/90 py-2 pr-4 pl-2 text-sm font-semibold shadow-[var(--shadow-float)] backdrop-blur-xl"
    >
      <IconBadge name={icon} tone={tone} size="sm" className="rounded-full" />
      {children}
    </div>
  )
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[calc(var(--safe-top)+12px)]">
      {reduce ? (
        open && badge
      ) : (
        <AnimatePresence>
          {open && (
            <motion.div
              key="toast"
              initial={{ y: -80, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -60, opacity: 0, scale: 0.95 }}
              transition={SPRING}
            >
              {badge}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>,
    document.body,
  )
}
