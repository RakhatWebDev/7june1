/**
 * Breathing patterns and a pure phase machine: the whole session is expanded into a flat
 * list of timed phases, and the current phase is derived from the elapsed time alone.
 */
export type PhaseKind = 'inhale' | 'hold' | 'exhale' | 'holdOut'

export interface BreathPhase {
  kind: PhaseKind
  sec: number
  /** Extra caption under the main label, e.g. "Вдох 12 из 30" */
  note?: string
}

export interface BreathPattern {
  /** Stored as `MindSession.preset` */
  id: string
  name: string
  description: string
  /** Phases of one cycle (round) */
  cycle: BreathPhase[]
  defaultCycles: number
  maxCycles: number
  /** Word for a cycle in the UI: «цикл» or «раунд» */
  unit: 'cycle' | 'round'
  caution?: string
}

export const PHASE_LABEL: Record<PhaseKind, string> = {
  inhale: 'Вдох',
  hold: 'Задержка',
  exhale: 'Выдох',
  holdOut: 'Задержка',
}

/** Circle scale at the end of each phase (holds keep the size reached before). */
export const PHASE_SCALE: Record<PhaseKind, number> = {
  inhale: 1,
  hold: 1,
  exhale: 0.55,
  holdOut: 0.55,
}

export const WIM_HOF_BREATHS = 30

function wimHofRound(): BreathPhase[] {
  const breaths: BreathPhase[] = []
  for (let i = 1; i <= WIM_HOF_BREATHS; i++) {
    const note = `Вдох ${i} из ${WIM_HOF_BREATHS}`
    breaths.push({ kind: 'inhale', sec: 2, note }, { kind: 'exhale', sec: 2, note })
  }
  return [
    ...breaths,
    { kind: 'holdOut', sec: 60, note: 'Задержка на выдохе' },
    { kind: 'inhale', sec: 3, note: 'Глубокий вдох' },
    { kind: 'hold', sec: 15, note: 'Задержка на вдохе' },
    { kind: 'exhale', sec: 3, note: 'Спокойный выдох' },
  ]
}

export const BREATH_PATTERNS: BreathPattern[] = [
  {
    id: 'box-4-4-4-4',
    name: 'Box 4-4-4-4',
    description: 'Квадратное дыхание: вдох, задержка, выдох, задержка по 4 секунды. Собирает внимание.',
    cycle: [
      { kind: 'inhale', sec: 4 },
      { kind: 'hold', sec: 4 },
      { kind: 'exhale', sec: 4 },
      { kind: 'holdOut', sec: 4 },
    ],
    defaultCycles: 8,
    maxCycles: 40,
    unit: 'cycle',
  },
  {
    id: '4-7-8',
    name: '4-7-8',
    description: 'Вдох 4 с, задержка 7 с, медленный выдох 8 с. Помогает расслабиться перед сном.',
    cycle: [
      { kind: 'inhale', sec: 4 },
      { kind: 'hold', sec: 7 },
      { kind: 'exhale', sec: 8 },
    ],
    defaultCycles: 4,
    maxCycles: 12,
    unit: 'cycle',
  },
  {
    id: 'coherent-5-5',
    name: 'Когерентное 5-5',
    description: 'Ровный вдох и выдох по 5 секунд — около 6 дыханий в минуту. Выравнивает ритм.',
    cycle: [
      { kind: 'inhale', sec: 5 },
      { kind: 'exhale', sec: 5 },
    ],
    defaultCycles: 30,
    maxCycles: 120,
    unit: 'cycle',
  },
  {
    id: 'wim-hof-lite',
    name: 'Wim Hof-лайт',
    description: '30 глубоких вдохов, задержка на выдохе 60 с, восстановительный вдох с задержкой 15 с.',
    cycle: wimHofRound(),
    defaultCycles: 3,
    maxCycles: 5,
    unit: 'round',
    caution: 'Только сидя или лёжа, не в воде и не за рулём. При головокружении остановитесь.',
  },
]

export function getPattern(id: string | null | undefined): BreathPattern | undefined {
  return BREATH_PATTERNS.find((p) => p.id === id)
}

export interface BreathStep {
  phase: BreathPhase
  /** 0-based cycle index */
  cycle: number
  startMs: number
  endMs: number
}

/** Expand `cycles` repetitions of the pattern into a timeline. */
export function buildSequence(pattern: BreathPattern, cycles: number): BreathStep[] {
  const steps: BreathStep[] = []
  let t = 0
  for (let c = 0; c < Math.max(1, Math.floor(cycles)); c++) {
    for (const phase of pattern.cycle) {
      const end = t + phase.sec * 1000
      steps.push({ phase, cycle: c, startMs: t, endMs: end })
      t = end
    }
  }
  return steps
}

export function sequenceMs(steps: BreathStep[]): number {
  return steps.length > 0 ? steps[steps.length - 1].endMs : 0
}

export function cycleMs(pattern: BreathPattern): number {
  return pattern.cycle.reduce((s, p) => s + p.sec * 1000, 0)
}

export interface BreathPosition {
  index: number
  step: BreathStep
  /** Time left in the current phase */
  remainingMs: number
  done: boolean
}

/** Which phase is active after `elapsedMs` of breathing. */
export function phaseAt(steps: BreathStep[], elapsedMs: number): BreathPosition {
  const last = steps.length - 1
  if (elapsedMs >= sequenceMs(steps)) return { index: last, step: steps[last], remainingMs: 0, done: true }
  // Binary search for the step with startMs <= t < endMs.
  let lo = 0
  let hi = last
  const t = Math.max(0, elapsedMs)
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (steps[mid].endMs <= t) lo = mid + 1
    else hi = mid
  }
  return { index: lo, step: steps[lo], remainingMs: steps[lo].endMs - t, done: false }
}
