import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, Card, PageHeader, Progress, Stepper } from '../../components/ui'
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
import { linkPrimary } from './styles'
import { completed, formatClock, sessionMinutes, shouldSave } from './timer'
import { useCountdown } from './useCountdown'

const REST_SCALE = 0.55

function unitForms(p: BreathPattern): [string, string, string] {
  return p.unit === 'round' ? ['раунд', 'раунда', 'раундов'] : ['цикл', 'цикла', 'циклов']
}

type Result = { saved: true; durationMin: number } | { saved: false }

/** Guided breathing: a CSS-animated circle follows the phases of the chosen pattern. */
export function BreathePage() {
  const [params] = useSearchParams()
  const [pattern, setPattern] = useState<BreathPattern>(() => getPattern(params.get('pattern')) ?? BREATH_PATTERNS[0])
  const [cycles, setCycles] = useState(pattern.defaultCycles)
  const steps = useMemo(() => buildSequence(pattern, cycles), [pattern, cycles])
  const timer = useCountdown(sequenceMs(steps), 200)
  const { state } = timer
  const pos = phaseAt(steps, state.elapsedMs)
  const [result, setResult] = useState<Result | null>(null)
  const handled = useRef(false)

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
    if (!shouldSave(state.elapsedMs)) {
      setResult({ saved: false })
      return
    }
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
      .then(() => setResult({ saved: true, durationMin }))
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
    setResult(null)
    timer.reset(sequenceMs(steps))
  }

  if (state.done) {
    return (
      <>
        <PageHeader title="Дыхание" back="/mind" />
        <Card className="text-center">
          <div className="text-5xl" aria-hidden>
            🌬️
          </div>
          <h2 className="mt-3 text-xl font-semibold">Практика завершена</h2>
          <p className="mt-1 text-sm text-muted" role="status">
            {result == null
              ? 'Сохраняем…'
              : result.saved
                ? `${pattern.name} · сохранено ${result.durationMin} ${plural(result.durationMin, ['минута', 'минуты', 'минут'])}`
                : 'Меньше 15 секунд — практика не сохранена'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link to="/mind" className={linkPrimary}>
              Готово
            </Link>
            <Button variant="secondary" onClick={again}>
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
  let circleStyle: CSSProperties
  if (!timer.started) {
    circleStyle = { transform: `scale(${REST_SCALE})` }
  } else if (timer.running) {
    // Animate to the end-of-phase size over the time left in the phase (CSS transition).
    circleStyle = { transform: `scale(${toScale})`, transitionDuration: `${Math.round(pos.remainingMs)}ms` }
  } else {
    // Paused: freeze at the interpolated size.
    const t = phaseMs > 0 ? 1 - pos.remainingMs / phaseMs : 1
    circleStyle = { transform: `scale(${fromScale + (toScale - fromScale) * t})`, transitionDuration: '0ms' }
  }
  const forms = unitForms(pattern)
  const totalSec = sequenceMs(steps) / 1000

  return (
    <>
      <PageHeader title="Дыхание" subtitle={timer.started ? pattern.name : 'Выберите технику'} back="/mind" />

      {!timer.started && (
        <div role="radiogroup" aria-label="Техника дыхания" className="mb-4 grid grid-cols-2 gap-2">
          {BREATH_PATTERNS.map((p) => {
            const active = p.id === pattern.id
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => choosePattern(p)}
                className={`rounded-2xl border p-3 text-left transition ${
                  active ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-accent/50'
                }`}
              >
                <div className={`text-sm font-semibold ${active ? 'text-accent' : ''}`}>{p.name}</div>
                <div className="mt-0.5 text-xs text-muted">{p.cycle.length > 8 ? '30 вдохов + задержка' : p.cycle.map((c) => c.sec).join('-')}</div>
              </button>
            )
          })}
        </div>
      )}

      <div className="relative mx-auto flex aspect-square w-full max-w-[18rem] items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-border" aria-hidden />
        <div
          data-testid="breath-circle"
          aria-hidden
          style={circleStyle}
          className="absolute inset-3 rounded-full bg-accent/20 shadow-[0_0_60px_-10px_var(--color-accent)] transition-transform ease-in-out will-change-transform motion-reduce:transition-none"
        >
          <div className="absolute inset-[18%] rounded-full bg-accent/25" />
        </div>
        <div className="relative text-center">
          <div aria-live="polite" data-testid="breath-phase" className="text-3xl font-semibold tracking-tight">
            {timer.started ? PHASE_LABEL[phase.kind] : 'Готовы?'}
          </div>
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
          <Progress value={state.totalMs > 0 ? state.elapsedMs / state.totalMs : 0} />
          <Button size="lg" variant={timer.running ? 'secondary' : 'primary'} className="w-full" onClick={timer.running ? timer.pause : start}>
            {timer.running ? 'Пауза' : 'Продолжить'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={timer.finish}>
            Завершить
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-muted">{pattern.description}</p>
          {pattern.caution && <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">{pattern.caution}</p>}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">
              {forms[2][0].toUpperCase() + forms[2].slice(1)} <span className="text-muted">· {formatClock(totalSec)}</span>
            </span>
            <Stepper
              aria-label="Количество циклов"
              value={cycles}
              min={1}
              max={pattern.maxCycles}
              onChange={(v) => chooseCycles(v ?? 1)}
            />
          </div>
          <Button size="lg" className="w-full" onClick={start}>
            Начать
          </Button>
        </div>
      )}
    </>
  )
}
