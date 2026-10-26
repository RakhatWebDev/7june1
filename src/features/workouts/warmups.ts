import type { SetLog } from '../../db/types'

/* ------------------------------------------------------------------ */
/* Warm-up sets before the first working set of a core lift            */
/* (docs/IDEAS.md: 40 % × 8, 60 % × 5, 80 % × 3 of the working weight). */
/* ------------------------------------------------------------------ */

const RAMP: [pct: number, reps: number][] = [
  [0.4, 8],
  [0.6, 5],
  [0.8, 3],
]
const PLATE_STEP = 2.5
const EMPTY_BAR = 20
/** Rest after a warm-up set, shorter than a working rest */
export const WARMUP_REST_SEC = 60

/** Warm-up sets for `workKg`: rounded to 2.5 kg, never below the empty bar, lighter than the working set, no repeats. */
export function warmupSets(workKg: number): SetLog[] {
  const out: SetLog[] = []
  for (const [pct, reps] of RAMP) {
    const weightKg = Math.max(EMPTY_BAR, Math.round((workKg * pct) / PLATE_STEP) * PLATE_STEP)
    if (weightKg >= workKg || out.some((s) => s.weightKg === weightKg)) continue
    out.push({ weightKg, reps, done: false, warmup: true })
  }
  return out
}
