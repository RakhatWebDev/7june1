import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Button, Card, Confetti, IconBadge, LinkButton, PageHeader, Progress, Stepper } from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import { plural } from '../../lib/format'
import {
  BREATH_PATTERNS,
  buildSequence,
  cycleMs,
  getPattern,
  PHASE_LABEL,
  PHASE_SCALE,
  phaseAt,
  sequenceMs,
  type BreathPattern,
} from './breath'
import { playGong, primeAudio, vibrate } from './device'
import { completed, formatClock, sessionMinutes, shouldSave } from './timer'
import { useCountdown } from './useCountdown'

const REST_SCALE = 0.55
/** Show one dot per cycle up to this many cycles; above it the counter alone is clearer. */
const MAX_DOTS = 12

function unitForms(p: BreathPattern): [string, string, string] {
  return p.unit === 'round' ? ['раунд', 'раунда', 'раундов'] : ['цикл', 'цикла', 'циклов']
}

/** Guided breathing: a CSS-animated circle follows the phases of the chosen pattern. */
export function BreathePage() {
  const [params] = useSearchParams()
  const [pattern, setPattern] = useState<BreathPattern>(() => getPattern(params.get('pattern')) ?? BREATH_PATTERNS[0])
  const [cycles, setCycles] = useState(pattern.defaultCycles)
  const steps = useMemo(() => buildSequence(pattern, cycles), [pattern, cycles])
  const timer = useCountdown(sequenceMs(steps), 200)
  const { state } = timer
  const pos = phaseAt(steps, state.elapsedMs)
  const [savedMin, setSavedMin] = useState<number | null>(null)
  const handled = useRef(false)
  const reduce = useReduceMotion()

  // Gentle buzz on each phase change (except the rapid Wim Hof breaths).
  const lastIndex = useRef(-1)
  useEffect(() => {
    if (!timer.running || pos.index === lastIndex.current) return
    const first = lastIndex.current === -1
    lastIndex.current = pos.index
    if (!first && pos.step.phase.sec >= 4) vibrate(40)
  }, [pos.index, pos.step.phase.sec, timer.running])

  useEffect(() => {
    if (!state.done || handled.current) return
    handled.current = true
    if (completed(state)) {
      playGong(528, 3)
      vibrate([200, 100, 200])
    }
    if (!shouldSave(state.elapsedMs)) return
    const durationMin = sessionMinutes(state.elapsedMs)
    void db.mindSessions
      .add({
        id: newId(),
        date: today(),
        kind: 'breathing',
        preset: pattern.id,
        durationMin,
        note: `${pattern.name}, ${cycles} ${plural(cycles, unitForms(pattern))}`,
        createdAt: new Date().toISOString(),
      })
      .then(() => setSavedMin(durationMin))
  }, [state, pattern, cycles])

  function choosePattern(p: BreathPattern) {
    setPattern(p)
    setCycles(p.defaultCycles)
    timer.reset(cycleMs(p) * p.defaultCycles)
  }

  function chooseCycles(n: number) {
    const c = Math.min(pattern.maxCycles, Math.max(1, Math.round(n)))
    setCycles(c)
    timer.reset(cycleMs(pattern) * c)
  }

  function start() {
    primeAudio()
    timer.start()
  }

  function again() {
    handled.current = false
    lastIndex.current = -1
    setSavedMin(null)
    timer.reset(sequenceMs(steps))
  }

  if (state.done) {
    return (
      <>
        <PageHeader title="Дыхание" back="/mind" />
        <Card variant="accent" tone="info" className="relative overflow-visible py-8 text-center">
          {completed(state) && <Confetti />}
          <motion.div
            className="mx-auto w-fit"
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          >
            <IconBadge name="wind" tone="info" size="lg" className="size-16 rounded-3xl" />
          </motion.div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">Практика завершена</h2>
          <p className="mt-1 text-sm text-muted" role="status">
            {!shouldSave(state.elapsedMs)
              ? 'Меньше 15 секунд — практика не сохранена'
              : savedMin == null
                ? 'Сохраняем…'
                : `${pattern.name} · сохранено ${savedMin} ${plural(savedMin, ['минута', 'минуты', 'минут'])}`}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <LinkButton to="/mind" icon="check">
              Готово
            </LinkButton>
            <Button variant="secondary" icon="history" onClick={again}>
              Ещё раз
            </Button>
          </div>
        </Card>
      </>
    )
  }

  const phase = pos.step.phase
  const phaseMs = phase.sec * 1000
  const fromScale = pos.index > 0 ? PHASE_SCALE[steps[pos.index - 1].phase.kind] : REST_SCALE
  const toScale = PHASE_SCALE[phase.kind]
  // Where the circle should be now and how long it has to get to the end of the phase.
  let scale: number
  let glideMs: number
  if (!timer.started) {
    scale = REST_SCALE
    glideMs = 400
  } else if (timer.running) {
    scale = toScale
    glideMs = Math.round(pos.remainingMs)
  } else {
    // Paused: freeze at the interpolated size.
    const t = phaseMs > 0 ? 1 - pos.remainingMs / phaseMs : 1
    scale = fromScale + (toScale - fromScale) * t
    glideMs = 0
  }
  const forms = unitForms(pattern)
  const totalSec = sequenceMs(steps) / 1000
  const label = timer.started ? PHASE_LABEL[phase.kind] : 'Готовы?'
  const expanding = timer.started && (phase.kind === 'inhale' || phase.kind === 'hold')

  return (
    <>
      <PageHeader title="Дыхание" subtitle={timer.started ? pattern.name : 'Выберите технику'} back="/mind" />

      {!timer.started && (
        <div role="radiogroup" aria-label="Техника дыхания" className="mb-5 grid grid-cols-2 gap-2">
          {BREATH_PATTERNS.map((p) => {
            const active = p.id === pattern.id
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => choosePattern(p)}
                className={`rounded-2xl border p-3 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 ${
                  active
                    ? 'border-info/60 bg-info/10 shadow-[0_8px_22px_-14px_var(--color-info)]'
                    : 'border-white/[0.06] bg-surface hover:border-white/15'
                }`}
              >
                <div className={`text-sm font-semibold tracking-tight ${active ? 'text-info' : ''}`}>{p.name}</div>
                <div className="mt-0.5 text-xs text-muted tabular-nums">
                  {p.cycle.length > 8 ? '30 вдохов + задержка' : p.cycle.map((c) => c.sec).join('-')}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="relative mx-auto flex aspect-square w-full max-w-[18rem] items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-info/20" aria-hidden />
        <div className="absolute inset-[22%] rounded-full border border-dashed border-info/15" aria-hidden />
        {reduce ? (
          <div
            data-testid="breath-circle"
            aria-hidden
            style={{ transform: `scale(${scale})` }}
            className="absolute inset-3 rounded-full bg-info/20 shadow-[0_0_60px_-10px_var(--color-info)]"
          >
            <div className="absolute inset-[18%] rounded-full bg-info/25" />
          </div>
        ) : (
          <motion.div
            data-testid="breath-circle"
            aria-hidden
            className="absolute inset-3 rounded-full bg-[radial-gradient(circle_at_35%_30%,color-mix(in_srgb,var(--color-info)_38%,transparent),color-mix(in_srgb,var(--color-info)_14%,transparent)_70%)] shadow-[0_0_70px_-12px_var(--color-info)] will-change-transform"
            initial={false}
            animate={{ scale }}
            transition={
              glideMs === 0
                ? { duration: 0 }
                : timer.running
                  ? { duration: glideMs / 1000, ease: 'easeInOut' }
                  : { type: 'spring', stiffness: 300, damping: 26 }
            }
          >
            <motion.div
              className="absolute inset-[18%] rounded-full bg-info/25"
              animate={{ opacity: expanding ? 1 : 0.55 }}
              transition={{ duration: 0.6 }}
            />
          </motion.div>
        )}
        <div className="relative text-center">
          <span className="sr-only" aria-live="polite">
            {label}
          </span>
          {reduce ? (
            <div data-testid="breath-phase" aria-hidden className="text-3xl font-semibold tracking-tight">
              {label}
            </div>
          ) : (
            <div data-testid="breath-phase" aria-hidden className="grid h-9 place-items-center">
              <AnimatePresence initial={false}>
                <motion.span
                  key={`${pos.index}-${label}`}
                  className="col-start-1 row-start-1 text-3xl font-semibold tracking-tight"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  {label}
                </motion.span>
              </AnimatePresence>
            </div>
          )}
          {timer.started && (
            <>
              <div className="mt-1 text-4xl font-bold tabular-nums" aria-label="Секунд в фазе">
                {Math.ceil(pos.remainingMs / 1000)}
              </div>
              {phase.note && <div className="mt-1 text-xs text-muted">{phase.note}</div>}
            </>
          )}
        </div>
      </div>

      {timer.started ? (
        <div className="mt-6 space-y-3">
          <div className="flex items-baseline justify-between text-sm text-muted">
            <span data-testid="breath-cycle">
              {forms[0][0].toUpperCase() + forms[0].slice(1)} {pos.step.cycle + 1} из {cycles}
            </span>
            <span className="tabular-nums">осталось {formatClock((state.totalMs - state.elapsedMs) / 1000)}</span>
          </div>
          {cycles <= MAX_DOTS ? (
            <ol className="flex justify-center gap-1.5" aria-label="Циклы">
              {Array.from({ length: cycles }, (_, i) => {
                const done = i < pos.step.cycle
                const current = i === pos.step.cycle
                return (
                  <motion.li
                    key={i}
                    aria-label={`${i + 1}: ${done ? 'пройден' : current ? 'сейчас' : 'впереди'}`}
                    className={`h-2 rounded-full ${done || current ? 'bg-info' : 'bg-surface-3'} ${current ? 'w-6' : 'w-2'}`}
                    initial={false}
                    animate={reduce ? undefined : { opacity: current ? [0.6, 1, 0.6] : 1 }}
                    transition={current ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                  />
                )
              })}
            </ol>
          ) : (
            <Progress tone="info" value={state.totalMs > 0 ? state.elapsedMs / state.totalMs : 0} aria-label="Прогресс практики" />
          )}
          <Button
            size="lg"
            variant={timer.running ? 'secondary' : 'primary'}
            icon={timer.running ? 'pause' : 'play'}
            className="w-full"
            onClick={timer.running ? timer.pause : start}
          >
            {timer.running ? 'Пауза' : 'Продолжить'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={timer.finish}>
            Завершить
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <Card className="flex gap-3 p-3">
            <IconBadge name="wind" tone="info" size="sm" />
            <p className="text-sm text-muted">{pattern.description}</p>
          </Card>
          {pattern.caution && (
            <p className="flex gap-2 rounded-2xl border border-warn/20 bg-warn/10 px-3 py-2.5 text-sm text-warn">
              <IconBadge name="info" tone="warn" size="sm" className="bg-transparent" />
              {pattern.caution}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">
              {forms[2][0].toUpperCase() + forms[2].slice(1)} <span className="text-muted tabular-nums">· {formatClock(totalSec)}</span>
            </span>
            <Stepper
              aria-label="Количество циклов"
              value={cycles}
              min={1}
              max={pattern.maxCycles}
              onChange={(v) => chooseCycles(v ?? 1)}
            />
          </div>
          <Button size="lg" icon="play" className="w-full" onClick={start}>
            Начать
          </Button>
        </div>
      )}
    </>
  )
}
