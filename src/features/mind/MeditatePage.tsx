import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, Card, Chip, PageHeader, Stepper } from '../../components/ui'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import { plural } from '../../lib/format'
import { MIND_KIND_ICON, type MindKind } from './calc'
import { playGong, primeAudio, vibrate } from './device'
import { TimerRing } from './parts'
import { linkPrimary, linkSecondary } from './styles'
import { completed, formatClock, remainingMs, sessionMinutes, shouldSave } from './timer'
import { useCountdown } from './useCountdown'

const TIMER_PRESETS = [5, 10, 15, 20]

type TimerKind = Exclude<MindKind, 'breathing'>

const KIND_TABS: { kind: TimerKind; label: string }[] = [
  { kind: 'meditation', label: 'Медитация' },
  { kind: 'prayer', label: 'Молитва' },
  { kind: 'reading_spiritual', label: 'Духовное чтение' },
]

const KIND_TEXT: Record<TimerKind, { title: string; hint: string; done: string }> = {
  meditation: {
    title: 'Медитация',
    hint: 'Сядьте удобно, закройте глаза и следите за дыханием. Отвлеклись — мягко вернитесь.',
    done: 'Медитация завершена',
  },
  prayer: {
    title: 'Молитва',
    hint: 'Тихое время для молитвы или сосредоточенного размышления — в вашей традиции и своими словами.',
    done: 'Время молитвы завершено',
  },
  reading_spiritual: {
    title: 'Духовное чтение',
    hint: 'Неспешное чтение текста, который для вас важен. Остановитесь на том, что откликается.',
    done: 'Чтение завершено',
  },
}

function parseKind(v: string | null): TimerKind {
  return v === 'prayer' || v === 'reading_spiritual' ? v : 'meditation'
}

function parseMinutes(v: string | null): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 1 && n <= 180 ? n : 10
}

/**
 * Meditation / prayer / spiritual reading timer: presets 5–20 min or custom, big ring,
 * gong at zero; finishing early saves the time actually spent.
 */
export function MeditatePage() {
  const [params, setParams] = useSearchParams()
  const kind = parseKind(params.get('kind'))
  const [minutes, setMinutes] = useState(() => parseMinutes(params.get('min')))
  const [custom, setCustom] = useState(() => !TIMER_PRESETS.includes(minutes))
  const timer = useCountdown(minutes * 60_000)
  const { state } = timer
  const [savedMin, setSavedMin] = useState<number | null>(null)
  const handled = useRef(false)
  const text = KIND_TEXT[kind]

  // Persist once when the timer is done (at zero or finished early).
  useEffect(() => {
    if (!state.done || handled.current) return
    handled.current = true
    if (completed(state)) {
      playGong()
      vibrate([200, 100, 200])
    }
    if (!shouldSave(state.elapsedMs)) return
    const durationMin = sessionMinutes(state.elapsedMs)
    const isPreset = TIMER_PRESETS.includes(Math.round(state.totalMs / 60_000))
    void db.mindSessions
      .add({
        id: newId(),
        date: today(),
        kind,
        preset: `${isPreset ? 'timer' : 'custom'}-${Math.round(state.totalMs / 60_000)}`,
        durationMin,
        createdAt: new Date().toISOString(),
      })
      .then(() => setSavedMin(durationMin))
  }, [state, kind])

  function choose(min: number, isCustom: boolean) {
    const m = Math.min(180, Math.max(1, Math.round(min)))
    setMinutes(m)
    setCustom(isCustom)
    timer.reset(m * 60_000)
  }

  function start() {
    primeAudio()
    timer.start()
  }

  function again() {
    handled.current = false
    setSavedMin(null)
    timer.reset(minutes * 60_000)
  }

  if (state.done) {
    return (
      <>
        <PageHeader title={text.title} back="/mind" />
        <Card className="text-center">
          <div className="text-5xl" aria-hidden>
            {MIND_KIND_ICON[kind]}
          </div>
          <h2 className="mt-3 text-xl font-semibold">{text.done}</h2>
          <p className="mt-1 text-sm text-muted" role="status">
            {!shouldSave(state.elapsedMs)
              ? 'Меньше 15 секунд — практика не сохранена'
              : savedMin == null
                ? 'Сохраняем…'
                : `Сохранено: ${savedMin} ${plural(savedMin, ['минута', 'минуты', 'минут'])}`}
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

  const remainingSec = remainingMs(state) / 1000
  const progress = state.totalMs > 0 ? state.elapsedMs / state.totalMs : 0

  return (
    <>
      <PageHeader title={text.title} subtitle={timer.started ? undefined : 'Таймер практики'} back="/mind" />

      {!timer.started && (
        <div role="group" aria-label="Вид практики" className="mb-4 flex flex-wrap gap-2">
          {KIND_TABS.map((t) => (
            <Chip key={t.kind} active={t.kind === kind} onClick={() => setParams({ kind: t.kind }, { replace: true })}>
              {t.label}
            </Chip>
          ))}
        </div>
      )}

      <TimerRing progress={progress}>
        <div role="timer" aria-label="Осталось" aria-live="off" className="text-6xl font-bold tracking-tight tabular-nums">
          {formatClock(remainingSec)}
        </div>
        <div className="mt-1 text-sm text-muted">
          {timer.running ? 'идёт практика' : timer.started ? 'пауза' : `${minutes} ${plural(minutes, ['минута', 'минуты', 'минут'])}`}
        </div>
      </TimerRing>

      {!timer.started ? (
        <div className="mt-6 space-y-4">
          <div role="group" aria-label="Длительность" className="grid grid-cols-5 gap-2">
            {TIMER_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={!custom && minutes === m}
                onClick={() => choose(m, false)}
                className={`rounded-xl border py-2 text-sm font-medium tabular-nums transition ${
                  !custom && minutes === m ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2 text-muted hover:text-text'
                }`}
              >
                {m} мин
              </button>
            ))}
            <button
              type="button"
              aria-pressed={custom}
              onClick={() => choose(minutes, true)}
              className={`rounded-xl border py-2 text-sm font-medium transition ${
                custom ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2 text-muted hover:text-text'
              }`}
            >
              Своё
            </button>
          </div>
          {custom && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted">Минут</span>
              <Stepper aria-label="Своя длительность, минут" value={minutes} min={1} max={180} onChange={(v) => choose(v ?? 1, true)} />
            </div>
          )}
          <p className="text-sm text-muted">{text.hint}</p>
          <Button size="lg" className="w-full" onClick={start}>
            Начать
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          <Button size="lg" variant={timer.running ? 'secondary' : 'primary'} className="w-full" onClick={timer.running ? timer.pause : start}>
            {timer.running ? 'Пауза' : 'Продолжить'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={timer.finish}>
            Завершить раньше
          </Button>
        </div>
      )}

      {!timer.started && (
        <div className="mt-4 text-center">
          <Link to="/mind/breathe" className={linkSecondary}>
            🌬️ Дыхательные практики
          </Link>
        </div>
      )}
    </>
  )
}
