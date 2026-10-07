import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import {
  Button,
  Card,
  Confetti,
  IconBadge,
  LinkButton,
  PageHeader,
  Ring,
  SegmentedControl,
  Stepper,
} from '../../components/ui'
import { toneTint, useReduceMotion } from '../../components/ui/helpers'
import { db } from '../../db'
import { today } from '../../lib/dates'
import { newId } from '../../lib/id'
import { plural } from '../../lib/format'
import type { MindKind } from './calc'
import { playGong, primeAudio, vibrate } from './device'
import { MIND_KIND_BADGE } from './styles'
import { completed, formatClock, remainingMs, sessionMinutes, shouldSave } from './timer'
import { useCountdown } from './useCountdown'

const TIMER_PRESETS = [5, 10, 15, 20]

type TimerKind = Exclude<MindKind, 'breathing'>

const KIND_TABS: { value: TimerKind; label: string }[] = [
  { value: 'meditation', label: 'Медитация' },
  { value: 'prayer', label: 'Молитва' },
  { value: 'reading_spiritual', label: 'Чтение' },
]

const RING_SIZE = 264

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
  const reduce = useReduceMotion()
  const badge = MIND_KIND_BADGE[kind]

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
    const saved = shouldSave(state.elapsedMs)
    return (
      <>
        <PageHeader title={text.title} back="/mind" />
        <Card variant="accent" tone={badge.tone} className="relative overflow-visible py-8 text-center">
          {completed(state) && <Confetti />}
          <motion.div
            className="mx-auto w-fit"
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          >
            <IconBadge name={completed(state) ? 'check' : badge.icon} tone={badge.tone} size="lg" className="size-16 rounded-3xl" />
          </motion.div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">{text.done}</h2>
          <p className="mt-1 text-sm text-muted" role="status">
            {!saved
              ? 'Меньше 15 секунд — практика не сохранена'
              : savedMin == null
                ? 'Сохраняем…'
                : `Сохранено: ${savedMin} ${plural(savedMin, ['минута', 'минуты', 'минут'])}`}
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

  const remainingSec = remainingMs(state) / 1000
  const progress = state.totalMs > 0 ? state.elapsedMs / state.totalMs : 0
  const finalCountdown = timer.running && remainingSec <= 10

  return (
    <>
      <PageHeader title={text.title} subtitle={timer.started ? undefined : 'Таймер практики'} back="/mind" />

      {!timer.started && (
        <SegmentedControl
          aria-label="Вид практики"
          className="mb-5"
          value={kind}
          onChange={(k) => setParams({ kind: k }, { replace: true })}
          options={KIND_TABS}
        />
      )}

      <div className="relative mx-auto grid w-fit place-items-center">
        {!reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-4 rounded-full"
            style={{ background: `radial-gradient(circle, ${toneTint(badge.tone, 24)} 0%, transparent 70%)` }}
            animate={
              finalCountdown
                ? { scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }
                : timer.running
                  ? { scale: [1, 1.04, 1], opacity: [0.35, 0.55, 0.35] }
                  : { scale: 1, opacity: 0.3 }
            }
            transition={
              finalCountdown
                ? { duration: 1, repeat: Infinity, ease: 'easeInOut' }
                : timer.running
                  ? { duration: 5, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.3 }
            }
          />
        )}
        <motion.div
          animate={reduce ? undefined : finalCountdown ? { scale: [1, 1.025, 1] } : { scale: 1 }}
          transition={finalCountdown ? { duration: 1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        >
          <Ring value={1 - progress} size={RING_SIZE} stroke={12} tone={badge.tone}>
            <div className="flex flex-col items-center">
              <div
                role="timer"
                aria-label="Осталось"
                aria-live="off"
                className={`text-[56px] leading-none font-bold tracking-tight tabular-nums transition-colors duration-300 ${
                  finalCountdown ? 'text-violet' : ''
                }`}
              >
                {formatClock(remainingSec)}
              </div>
              <div className="mt-2 text-sm text-muted">
                {timer.running ? 'идёт практика' : timer.started ? 'пауза' : `${minutes} ${plural(minutes, ['минута', 'минуты', 'минут'])}`}
              </div>
            </div>
          </Ring>
        </motion.div>
      </div>

      {!timer.started ? (
        <div className="mt-6 space-y-4">
          <SegmentedControl
            aria-label="Длительность"
            value={custom ? 'custom' : String(minutes)}
            onChange={(v) => (v === 'custom' ? choose(minutes, true) : choose(Number(v), false))}
            options={[
              ...TIMER_PRESETS.map((m) => ({
                value: String(m),
                label: (
                  <span className="tabular-nums">
                    {m}{' '}
                    <span className="text-[11px] font-normal text-muted">мин</span>
                  </span>
                ),
              })),
              { value: 'custom', label: 'Своё' },
            ]}
            className="[&>button]:px-1"
          />
          {custom && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted">Минут</span>
              <Stepper aria-label="Своя длительность, минут" value={minutes} min={1} max={180} onChange={(v) => choose(v ?? 1, true)} />
            </div>
          )}
          <Card className="flex gap-3 p-3">
            <IconBadge name={badge.icon} tone={badge.tone} size="sm" />
            <p className="text-sm text-muted">{text.hint}</p>
          </Card>
          <Button size="lg" icon="play" className="w-full" onClick={start}>
            Начать
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
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
            Завершить раньше
          </Button>
        </div>
      )}

      {!timer.started && (
        <div className="mt-3 text-center">
          <LinkButton to="/mind/breathe" variant="ghost" icon="wind">
            Дыхательные практики
          </LinkButton>
        </div>
      )}
    </>
  )
}
