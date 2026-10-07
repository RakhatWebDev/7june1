/** Button-looking styles for router <Link>s (shared Button renders a <button>). */
const base =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition-[background-color,transform] active:scale-[0.97] motion-reduce:active:scale-100'
export const primaryLink = `${base} bg-accent font-semibold text-bg hover:bg-accent-strong shadow-[0_10px_24px_-14px_rgb(180_240_60/0.8)]`
export const secondaryLink = `${base} bg-surface-2 text-text hover:bg-surface-3 border border-white/[0.05]`
