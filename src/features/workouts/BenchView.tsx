import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui'
import { formatClock } from './calc'
import type { HandsFreeMode, WakeState } from './handsFree'
import { useRestCountdown } from './useRestCountdown'

export interface BenchRest {
  key: number
  sec: number
  /** Known once the countdown reports it (or restored after a reload) */
  endsAt?: number
}

export interface BenchNext {
  /** Set only when the next set belongs to another exercise */
  exerciseName?: string
  /** «Подход 1 из 4» */
  setLabel: string
  /** «82,5 × 6» */
  load: string
}

type AdjustKind = 'reps' | 'weight'

/**
 * Full-screen «скамья» view of the guided session (docs/designs/hands-free-gym.md): almost black,
 * huge numbers, one tap zone = «подход сделан по плану». Static on purpose (screen is on for an hour):
 * motion only in the last 5 s of a rest. Sits above the bottom nav (z-40) and below sheets (z-50).
 */
export function BenchView({
  position,
  next,
  rest,
  mode,
  wake,
  audioOff,
  undoLabel,
  adjust,
  onTap,
  onUndo,
  onAdjust,
  onSkipRest,
  onElapsed,
  onEndsAtChange,
  onCard,
  onFinishSession,
  onPrime,
}: {
  /** «Упражнение 2 из 6» */
  position: string
  next: BenchNext | null
  rest: BenchRest | null
  mode: HandsFreeMode
  wake: WakeState
  /** Sound is not unlocked yet (after a reload, before the first touch) */
  audioOff: boolean
  /** «Отменить подход 2» while the just-finished set can be undone */
  undoLabel: string | null
  /** Correction of the just-finished set; `null` hides it */
  adjust: { canWeight: boolean } | null
  onTap: () => void
  onUndo: () => void
  onAdjust: (kind: AdjustKind, delta: 1 | -1) => void
  onSkipRest: () => void
  onElapsed: () => void
  onEndsAtChange: (key: number, endsAt: number) => void
  onCard: () => void
  onFinishSession: () => void
  /** Any touch inside the view unlocks audio and speech (iOS) */
  onPrime: () => void
}) {
  const wakeBad = wake === 'unsupported' || wake === 'denied' || wake === 'released'
  const sound = mode === 'voice' || mode === 'tone'

  const corrections = (
    <>
      {undoLabel && (
        <Button variant="secondary" size="lg" className="w-full" onClick={onUndo}>
          {undoLabel}
        </Button>
      )}
      {adjust && (
        <div className="grid grid-cols-4 gap-2">
          <BigControl label="Минус повтор" onClick={() => onAdjust('reps', -1)}>
            −1 повт
          </BigControl>
          <BigControl label="Плюс повтор" onClick={() => onAdjust('reps', 1)}>
            +1 повт
          </BigControl>
          {adjust.canWeight && (
            <>
              <BigControl label="Минус вес" onClick={() => onAdjust('weight', -1)}>
                − вес
              </BigControl>
              <BigControl label="Плюс вес" onClick={() => onAdjust('weight', 1)}>
                + вес
              </BigControl>
            </>
          )}
        </div>
      )}
    </>
  )

  return (
    <div
      data-testid="bench-view"
      role="region"
      aria-label="Режим скамьи"
      className="fixed inset-0 z-[45] flex flex-col gap-3 bg-black px-4 pt-[calc(var(--safe-top)+8px)] pb-safe text-text"
      onClickCapture={onPrime}
    >
      <div className="flex min-h-14 items-center gap-2">
        <Button size="sm" variant="secondary" icon="chevron-left" onClick={onCard}>
          Карточка
        </Button>
        <p className="min-w-0 flex-1 truncate text-right text-sm text-muted tabular-nums">
          {position}
        </p>
      </div>

      {wakeBad && (
        <p role="status" className="rounded-2xl bg-warn/15 px-3 py-2 text-xs text-warn">
          Экран может погаснуть. Нужна iOS 18.4+ и выключенный режим энергосбережения, или откройте
          FORMA во вкладке Safari.
        </p>
      )}
      {sound && audioOff && (
        <button
          type="button"
          className="rounded-2xl bg-surface-2 px-3 py-2 text-left text-xs text-muted"
          onClick={onPrime}
        >
          Звук выключен — коснитесь экрана
        </button>
      )}

      {rest ? (
        <RestBody
          key={rest.key}
          rest={rest}
          next={next}
          mode={mode}
          onTap={onTap}
          onSkip={onSkipRest}
          onElapsed={onElapsed}
          onEndsAtChange={(endsAt) => onEndsAtChange(rest.key, endsAt)}
          corrections={corrections}
        />
      ) : (
        <>
          <TapZone onTap={onTap}>
            {next ? (
              <NextSet next={next} />
            ) : (
              <p className="text-2xl font-semibold tracking-tight">Все упражнения выполнены</p>
            )}
          </TapZone>
          <div className="grid gap-2 pb-3">
            {next ? (
              <p className="text-center text-sm text-muted">
                Коснитесь экрана, когда закончите подход
              </p>
            ) : (
              <Button size="lg" icon="check" className="w-full" onClick={onFinishSession}>
                Завершить тренировку
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** The whole middle of the screen: one target for a knuckle tap. */
function TapZone({
  onTap,
  children,
  alert = false,
}: {
  onTap: () => void
  children: ReactNode
  alert?: boolean
}) {
  return (
    <button
      type="button"
      aria-label="Подход сделан"
      onClick={onTap}
      className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-3xl text-center select-none ${
        alert ? 'ring-2 ring-accent' : ''
      }`}
    >
      {children}
    </button>
  )
}

function NextSet({ next }: { next: BenchNext }) {
  return (
    <>
      {next.exerciseName && <p className="text-lg font-medium text-muted">{next.exerciseName}</p>}
      <p className="text-base text-muted">{next.setLabel}</p>
      {next.load && (
        <p className="text-6xl leading-none font-bold tracking-tight tabular-nums">{next.load}</p>
      )}
    </>
  )
}

function BigControl({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="min-h-14 rounded-2xl bg-surface-2 text-sm font-semibold tabular-nums active:bg-surface-3"
    >
      {children}
    </button>
  )
}

/** A running (or just finished) rest: countdown in the tap zone, +30 s / skip and corrections below. */
function RestBody({
  rest,
  next,
  mode,
  onTap,
  onSkip,
  onElapsed,
  onEndsAtChange,
  corrections,
}: {
  rest: BenchRest
  next: BenchNext | null
  mode: HandsFreeMode
  onTap: () => void
  onSkip: () => void
  onElapsed: () => void
  onEndsAtChange: (endsAt: number) => void
  corrections: ReactNode
}) {
  const { remaining, finished, warning, addTime, endsAt } = useRestCountdown(rest.sec, {
    initialEndsAt: rest.endsAt,
  })
  const elapsedRef = useRef(onElapsed)
  const endsAtRef = useRef(onEndsAtChange)
  useEffect(() => {
    elapsedRef.current = onElapsed
    endsAtRef.current = onEndsAtChange
  })
  useEffect(() => {
    endsAtRef.current(endsAt)
  }, [endsAt])
  /** Minutes past the end when the rest was seen finished (e.g. back from the background) */
  const [overdueMin, setOverdueMin] = useState(0)
  useEffect(() => {
    if (!finished) return
    elapsedRef.current()
    // Reads the wall clock once, when the rest is seen finished; not derivable during render.
    // eslint-disable-next-line react/set-state-in-effect
    setOverdueMin(Math.floor((Date.now() - endsAt) / 60_000))
  }, [finished, endsAt])

  return (
    <>
      <TapZone onTap={onTap} alert={finished && mode === 'screen'}>
        <div data-testid="bench-rest" className="flex flex-col items-center gap-2">
          {finished ? (
            <>
              {next ? (
                <NextSet next={next} />
              ) : (
                <p className="text-2xl font-semibold">Все упражнения выполнены</p>
              )}
              {overdueMin >= 1 && (
                <p className="text-sm text-muted">Отдых закончился {overdueMin} мин назад</p>
              )}
            </>
          ) : (
            <>
              <p className="text-base text-muted">Отдых</p>
              <p
                className={`text-7xl leading-none font-bold tracking-tight tabular-nums ${
                  warning ? 'animate-pulse-soft text-warn motion-reduce:animate-none' : ''
                }`}
              >
                {formatClock(remaining)}
              </p>
              {next && (
                <p className="mt-2 text-lg text-muted tabular-nums">
                  Дальше: {next.exerciseName ? `${next.exerciseName}, ` : ''}
                  {next.load || next.setLabel}
                </p>
              )}
            </>
          )}
        </div>
      </TapZone>
      <div className="grid gap-2 pb-3">
        {corrections}
        {!finished && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={addTime}>
              +30 с
            </Button>
            <Button variant="secondary" size="lg" onClick={onSkip}>
              Пропустить отдых
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
