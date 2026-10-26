import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Button, Card, Confetti, EmptyState, IconBadge } from '../../components/ui'
import { Icon } from '../../components/icons'
import { useReduceMotion } from '../../components/ui/helpers'
import { db } from '../../db'
import type { Exercise, SessionExercise, SetLog, WorkoutSession } from '../../db/types'
import { audioReady, cancelSpeech, playTone, primeAudio, speak, warmSpeech } from '../../lib/device'
import { int, plural } from '../../lib/format'
import { ACTIVE_REST_KEY, addSet, removeExercise, updateSet, updateWarmup } from './actions'
import { accessoryIncrement } from './autoreg'
import { BenchView, type BenchNext } from './BenchView'
import { BigRestTimer } from './BigRestTimer'
import { doneSetCount, fmtKg, sessionVolume, type PastPerformance } from './calc'
import { ConfirmSheet } from './ConfirmSheet'
import { restOverPhrase, tapPhrase, type NextSetCue } from './cues'
import { WARMUP_REST_SEC } from './warmups'
import { ExerciseTechniqueSheet } from './ExerciseTechniqueSheet'
import { finishSetPatch, firstPending, isPending, nextPending, nextUndoneSet } from './guided'
import {
  cueForTarget,
  nextAfter,
  tapTarget,
  useRestCues,
  useSessionWakeLock,
  type HandsFreeMode,
  type SetRef,
} from './handsFree'
import { planLine } from './labels'
import {
  ExerciseHint,
  LastTimeRow,
  SetList,
  TechniqueMedia,
  TechniqueThumb,
  WarmupChips,
} from './SessionExerciseCard'

const DEFAULT_REST_SEC = 90
/** Pause on the «time is up» state before moving on to the next exercise */
const AUTO_ADVANCE_MS = 1500
/** Bench view: taps this soon after a set are treated as a double tap and ignored */
const EARLY_TAP_GUARD_MS = 5000
/** A stored rest older than this (past its end) is not restored */
const RESTORE_WINDOW_MS = 60_000
const EASE_OUT = [0.22, 1, 0.36, 1] as const

interface Rest {
  key: number
  sec: number
  /** Exercise whose set started the rest */
  exIdx: number
  startedAt: number
  /** Wall-clock end, reported by the countdown (or restored after a reload) */
  endsAt?: number
}

/** The last bench tap: what undo restores and what the corrections edit. */
interface LastTap extends SetRef {
  prev: Pick<SetLog, 'done' | 'weightKg' | 'reps'>
  after: { weightKg: number | null; reps: number | null }
  prevRest: Rest | null
  prevFocus: number | null
}

interface StoredRest {
  sessionId: string
  exIdx: number
  sec: number
  endsAt: number
}

function isStoredRest(v: unknown): v is StoredRest {
  const r = v as Partial<StoredRest> | null
  return (
    !!r &&
    typeof r.sessionId === 'string' &&
    typeof r.exIdx === 'number' &&
    typeof r.sec === 'number' &&
    typeof r.endsAt === 'number'
  )
}

/** «82,5 × 6», «12 повт.», «до отказа» */
function loadText(cue: NextSetCue): string {
  const reps = cue.reps?.trim().toUpperCase() === 'AMRAP' ? 'до отказа' : cue.reps
  if (cue.weightKg != null)
    return reps ? `${fmtKg(cue.weightKg)} × ${reps}` : `${fmtKg(cue.weightKg)} кг`
  return reps ? (reps === 'до отказа' ? reps : `${reps} повт.`) : ''
}

/**
 * Guided («По шагам») view of an active session: one exercise at a time with a progress strip,
 * a big «Завершить подход N» button, an inline rest timer and auto-advance to the next exercise
 * once the last set is done and the rest is over. Ends with a «Все упражнения выполнены» card.
 */
export function GuidedSession({
  session,
  lasts,
  library,
  hideMedia,
  onReplace,
  onAddExercise,
  onFinish,
  mode = 'off',
}: {
  session: WorkoutSession
  /** Last performance per exercise index */
  lasts: (PastPerformance | null)[]
  library: Map<string, Exercise>
  hideMedia: boolean
  onReplace: (exIdx: number) => void
  onAddExercise: () => void
  onFinish: () => void
  /** Hands-free («скамья») mode; 'off' keeps the classic card */
  mode?: HandsFreeMode
}) {
  const reduce = useReduceMotion()
  const exs = session.exercises
  /** Exercise the user is on; `null` = follow the first pending one */
  const [focus, setFocus] = useState<number | null>(null)
  const [dir, setDir] = useState(1)
  const [rest, setRest] = useState<Rest | null>(null)
  /** Last rest preset chosen in this session (overrides the exercise rest) */
  const [restChoice, setRestChoice] = useState<number | null>(null)
  /** Exercise just completed → confetti */
  const [celebrate, setCelebrate] = useState<{ exIdx: number; key: number } | null>(null)
  const [elapsed, setElapsed] = useState(false)
  const [removeIdx, setRemoveIdx] = useState<number | null>(null)
  /** «Карточка» pressed in this hands-free mode → classic card until the mode changes */
  const [cardViewFor, setCardViewFor] = useState<HandsFreeMode | null>(null)
  const [lastTap, setLastTap] = useState<LastTap | null>(null)
  /** Rest tones already played, `${restKey}:${cue}` */
  const [playedCues] = useState(() => new Set<string>())
  const [restored, setRestored] = useState(false)
  const bench = mode !== 'off' && cardViewFor !== mode
  const wake = useSessionWakeLock(mode !== 'off')

  // A rest survives a reload, a list ↔ guided switch or a trip to «Подробнее».
  useEffect(() => {
    let alive = true
    void db.settings.get(ACTIVE_REST_KEY).then((row) => {
      if (!alive) return
      const v = row?.value
      if (
        isStoredRest(v) &&
        v.sessionId === session.id &&
        v.exIdx < session.exercises.length &&
        Date.now() <= v.endsAt + RESTORE_WINDOW_MS
      ) {
        setFocus(v.exIdx)
        setRest(
          (r) =>
            r ?? {
              key: Date.now(),
              sec: v.sec,
              exIdx: v.exIdx,
              startedAt: v.endsAt - v.sec * 1000,
              endsAt: v.endsAt,
            },
        )
      }
      setRestored(true)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mounted session
  }, [session.id])

  // Single writer of the stored rest: mirrors `rest` (and deletes it when there is no rest).
  useEffect(() => {
    if (!restored) return
    if (rest?.endsAt != null)
      void db.settings.put({
        key: ACTIVE_REST_KEY,
        value: {
          sessionId: session.id,
          exIdx: rest.exIdx,
          sec: rest.sec,
          endsAt: rest.endsAt,
        } satisfies StoredRest,
      })
    else if (!rest) void db.settings.delete(ACTIVE_REST_KEY)
  }, [restored, rest, session.id])

  const reportEndsAt = (key: number, endsAt: number) =>
    setRest((r) => (r && r.key === key && r.endsAt !== endsAt ? { ...r, endsAt } : r))

  const pending = firstPending(exs)
  const cur: number | 'done' =
    focus != null && focus < exs.length ? focus : pending >= 0 ? pending : 'done'
  const curEx = cur === 'done' ? undefined : exs[cur]
  /** The set a bench tap would record now, and what the voice says about it */
  const nextRef = cur === 'done' ? null : tapTarget(exs, cur)
  const nextCueData = cueForTarget(exs, nextRef, lasts, cur === 'done' ? -1 : cur)

  useRestCues({
    restKey: rest?.key ?? null,
    endsAt: rest?.endsAt ?? null,
    totalSec: rest?.sec ?? 0,
    mode,
    played: playedCues,
    goPhrase: restOverPhrase(nextCueData),
  })

  const goTo = (i: number | null, direction: number) => {
    setRest(null)
    setElapsed(false)
    setCelebrate(null)
    setDir(direction)
    setFocus(i)
  }

  const advance = (from: number) => {
    const n = nextPending(exs, from)
    goTo(n >= 0 ? n : null, n >= 0 && n < from ? -1 : 1)
  }

  const endRest = () => {
    if (!rest) return
    const ex = exs[rest.exIdx]
    if (ex && !isPending(ex)) advance(rest.exIdx)
    else {
      setRest(null)
      setElapsed(false)
    }
  }
  const endRestRef = useRef(endRest)
  useEffect(() => {
    endRestRef.current = endRest
  })

  const restEx = rest ? exs[rest.exIdx] : undefined
  const restComplete = !!restEx && !isPending(restEx)
  // The timer ran out after the exercise's last set → move on by itself after a short beat.
  useEffect(() => {
    if (!elapsed || !restComplete) return
    const t = setTimeout(() => endRestRef.current(), AUTO_ADVANCE_MS)
    return () => clearTimeout(t)
  }, [elapsed, restComplete])

  /** A set of exercise `exIdx` was just marked done (big button or the row checkbox). */
  const onSetDone = (exIdx: number, setIdx: number) => {
    const ex = exs[exIdx]
    if (!ex) return
    setFocus(exIdx)
    const last = !ex.sets.some((s, i) => i !== setIdx && !s.done)
    if (last) setCelebrate({ exIdx, key: Date.now() })
    setElapsed(false)
    const now = Date.now()
    setRest({ key: now, sec: restChoice ?? ex.restSec ?? DEFAULT_REST_SEC, exIdx, startedAt: now })
  }

  /** Bench tap: the next set by plan, a confirmation tone and (voice) the phrase — all inside the gesture. */
  const benchTap = () => {
    if (rest && Date.now() - rest.startedAt < EARLY_TAP_GUARD_MS) return
    const from = cur === 'done' ? 0 : cur
    const found = tapTarget(exs, from)
    // The previous tap's write may not be back from IndexedDB yet: never record the same set twice.
    const stale =
      found &&
      lastTap &&
      found.exIdx === lastTap.exIdx &&
      found.setIdx === lastTap.setIdx &&
      !!found.warmup === !!lastTap.warmup
    const target =
      stale && lastTap ? nextAfter(exs, lastTap.exIdx, lastTap.setIdx, lastTap.warmup) : found
    if (!target) return
    const ex = exs[target.exIdx]
    const set = target.warmup ? ex.warmups?.[target.setIdx] : ex.sets[target.setIdx]
    if (!set) return
    const patch = target.warmup
      ? { done: true }
      : finishSetPatch(ex, target.setIdx, lasts[target.exIdx] ?? null)
    const restSec = target.warmup ? WARMUP_REST_SEC : (restChoice ?? ex.restSec ?? DEFAULT_REST_SEC)
    setLastTap({
      ...target,
      prev: { done: set.done, weightKg: set.weightKg, reps: set.reps },
      after: {
        weightKg: patch.weightKg ?? set.weightKg ?? null,
        reps: patch.reps ?? set.reps ?? null,
      },
      prevRest: rest,
      prevFocus: focus,
    })
    playTone('confirm')
    if (mode === 'voice') {
      const next = cueForTarget(
        exs,
        nextAfter(exs, target.exIdx, target.setIdx, target.warmup),
        lasts,
        target.exIdx,
      )
      speak(tapPhrase({ restSec, next }))
    }
    if (target.exIdx !== from) setDir(1)
    if (target.warmup) {
      setFocus(target.exIdx)
      setElapsed(false)
      const now = Date.now()
      setRest({ key: now, sec: restSec, exIdx: target.exIdx, startedAt: now })
      void updateWarmup(session.id, target.exIdx, target.setIdx, patch)
      return
    }
    onSetDone(target.exIdx, target.setIdx)
    void updateSet(session.id, target.exIdx, target.setIdx, patch)
  }

  /** Writes to the set `lastTap` points at (a warm-up or a working set). */
  const writeLastTap = (tap: LastTap, patch: Partial<SetLog>) =>
    void (tap.warmup ? updateWarmup : updateSet)(session.id, tap.exIdx, tap.setIdx, patch)

  /** Undo the last bench tap: the set as it was and the previous rest (if the tap was early). */
  const undoLastTap = () => {
    if (!lastTap) return
    cancelSpeech()
    writeLastTap(lastTap, lastTap.prev)
    setCelebrate(null)
    setElapsed(false)
    setRest(lastTap.prevRest)
    setFocus(lastTap.prevFocus)
    setLastTap(null)
  }

  /** ±1 rep / ± one weight step on the just-finished set. */
  const adjustLastTap = (kind: 'reps' | 'weight', delta: 1 | -1) => {
    if (!lastTap) return
    const ex = exs[lastTap.exIdx]
    if (!ex) return
    if (kind === 'reps') {
      const reps = Math.max(0, (lastTap.after.reps ?? 0) + delta)
      setLastTap({ ...lastTap, after: { ...lastTap.after, reps } })
      writeLastTap(lastTap, { reps })
      return
    }
    if (lastTap.after.weightKg == null) return
    const step = accessoryIncrement(ex.exerciseId, library.get(ex.exerciseId))
    const weightKg = Math.max(0, lastTap.after.weightKg + delta * step)
    setLastTap({ ...lastTap, after: { ...lastTap.after, weightKg } })
    writeLastTap(lastTap, { weightKg })
  }

  const finishSet = (exIdx: number) => {
    const ex = exs[exIdx]
    const setIdx = ex ? nextUndoneSet(ex) : -1
    if (!ex || setIdx < 0) return
    onSetDone(exIdx, setIdx)
    void updateSet(session.id, exIdx, setIdx, finishSetPatch(ex, setIdx, lasts[exIdx] ?? null))
  }

  const confirmRemove = (idx: number) => {
    void removeExercise(session.id, idx)
    setRest(null)
    setCelebrate(null)
    if (cur === 'done') return
    // The exercise after the removed one shifts into its index.
    if (idx === cur) setFocus(idx < exs.length - 1 ? idx : null)
    else if (idx < cur) setFocus(cur - 1)
  }

  if (exs.length === 0)
    return (
      <>
        <EmptyState
          icon="dumbbell"
          title="В тренировке нет упражнений"
          hint="Добавьте упражнение из библиотеки."
        />
        <Button variant="secondary" icon="plus" className="mt-4 w-full" onClick={onAddExercise}>
          Добавить упражнение
        </Button>
      </>
    )

  const restLabelText = (): string => {
    if (!restEx || !rest) return ''
    const nextSet = nextUndoneSet(restEx)
    if (nextSet >= 0) return `следующий: подход ${nextSet + 1} из ${restEx.sets.length}`
    const n = nextPending(exs, rest.exIdx)
    return n >= 0 ? `следующий: ${exs[n].name}` : 'все упражнения выполнены'
  }
  const restDoneLabel = !restComplete
    ? 'Следующий подход'
    : nextPending(exs, rest?.exIdx ?? 0) >= 0
      ? 'Следующее упражнение'
      : 'К завершению'

  const body =
    cur === 'done' || !curEx ? (
      <FinishCard session={session} onFinish={onFinish} />
    ) : (
      <GuidedExerciseCard
        sessionId={session.id}
        exIdx={cur}
        exercise={curEx}
        libraryExercise={library.get(curEx.exerciseId)}
        last={lasts[cur] ?? null}
        hideMedia={hideMedia}
        celebrateKey={celebrate?.exIdx === cur ? celebrate.key : null}
        hasNext={nextPending(exs, cur) >= 0}
        onSetDone={(setIdx) => onSetDone(cur, setIdx)}
        onFinishSet={() => finishSet(cur)}
        onNext={() => advance(cur)}
        onReplace={() => onReplace(cur)}
        onRemove={() => setRemoveIdx(cur)}
        onFinishSession={onFinish}
        timer={
          rest && rest.exIdx === cur ? (
            <BigRestTimer
              key={rest.key}
              durationSec={rest.sec}
              label={restLabelText()}
              doneLabel={restDoneLabel}
              onDone={endRest}
              onElapsed={() => setElapsed(true)}
              onPreset={(sec) => {
                setRestChoice(sec)
                setElapsed(false)
                const now = Date.now()
                setRest({ ...rest, sec, key: now, startedAt: now, endsAt: undefined })
              }}
              initialEndsAt={rest.endsAt}
              onEndsAtChange={(endsAt) => reportEndsAt(rest.key, endsAt)}
            />
          ) : null
        }
      />
    )

  const bodyKey = cur === 'done' ? 'done' : `${cur}-${curEx?.exerciseId}`

  if (bench) {
    const benchNext: BenchNext | null =
      nextRef && nextCueData
        ? {
            exerciseName: nextCueData.exerciseName,
            setLabel: nextRef.warmup
              ? `Разминка ${nextRef.setIdx + 1} из ${exs[nextRef.exIdx].warmups?.length ?? 0}`
              : `Подход ${nextRef.setIdx + 1} из ${exs[nextRef.exIdx].sets.length}`,
            load: loadText(nextCueData),
          }
        : null
    return (
      <BenchView
        position={
          cur === 'done' ? 'Все упражнения выполнены' : `Упражнение ${cur + 1} из ${exs.length}`
        }
        next={benchNext}
        rest={rest}
        mode={mode}
        wake={wake}
        audioOff={!audioReady()}
        undoLabel={
          rest && lastTap
            ? `Отменить ${lastTap.warmup ? 'разминку' : 'подход'} ${lastTap.setIdx + 1}`
            : null
        }
        adjust={rest && lastTap ? { canWeight: lastTap.after.weightKg != null } : null}
        onTap={benchTap}
        onUndo={undoLastTap}
        onAdjust={adjustLastTap}
        onSkipRest={endRest}
        onElapsed={() => setElapsed(true)}
        onEndsAtChange={reportEndsAt}
        onCard={() => setCardViewFor(mode)}
        onFinishSession={onFinish}
        onPrime={() => {
          primeAudio()
          warmSpeech()
        }}
      />
    )
  }

  return (
    <>
      {mode !== 'off' && (
        <Button
          variant="secondary"
          size="sm"
          className="mb-3 w-full"
          onClick={() => setCardViewFor(null)}
        >
          Вид скамьи
        </Button>
      )}
      <ProgressStrip
        exercises={exs}
        current={cur}
        onGo={(i) => goTo(i, cur === 'done' || i > cur ? 1 : -1)}
      />
      {reduce ? (
        <div key={bodyKey}>{body}</div>
      ) : (
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={bodyKey}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 48 }),
              center: { opacity: 1, x: 0, transition: { duration: 0.26, ease: EASE_OUT } },
              exit: (d: number) => ({
                opacity: 0,
                x: d * -48,
                transition: { duration: 0.16, ease: 'easeIn' },
              }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {body}
          </motion.div>
        </AnimatePresence>
      )}
      <Button variant="ghost" icon="plus" className="mt-3 w-full" onClick={onAddExercise}>
        Добавить упражнение
      </Button>
      <ConfirmSheet
        open={removeIdx !== null}
        title="Удалить упражнение?"
        text={removeIdx !== null ? exs[removeIdx]?.name : undefined}
        onConfirm={() => removeIdx !== null && confirmRemove(removeIdx)}
        onClose={() => setRemoveIdx(null)}
      />
    </>
  )
}

/** «Упражнение 2 из 6», prev/next chevrons and one tappable segment per exercise. */
function ProgressStrip({
  exercises,
  current,
  onGo,
}: {
  exercises: SessionExercise[]
  current: number | 'done'
  onGo: (i: number) => void
}) {
  const n = exercises.length
  const idx = current === 'done' ? n : current
  const chevron =
    'grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-30'
  return (
    <nav aria-label="Упражнения тренировки" className="mb-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Предыдущее упражнение"
          className={chevron}
          disabled={idx <= 0}
          onClick={() => onGo(idx - 1)}
        >
          <Icon name="chevron-left" size={20} />
        </button>
        <p
          className="flex-1 text-center text-sm font-medium tabular-nums"
          data-testid="guided-position"
        >
          {current === 'done' ? 'Все упражнения выполнены' : `Упражнение ${current + 1} из ${n}`}
        </p>
        <button
          type="button"
          aria-label="Следующее упражнение"
          className={chevron}
          disabled={idx >= n - 1}
          onClick={() => onGo(idx + 1)}
        >
          <Icon name="chevron-right" size={20} />
        </button>
      </div>
      <ol className="mt-1 flex gap-1 px-1">
        {exercises.map((e, i) => {
          const done = e.sets.length > 0 && !isPending(e)
          const isCur = i === current
          return (
            <li key={i} className="min-w-0 flex-1">
              <button
                type="button"
                aria-label={`Упражнение ${i + 1}: ${e.name}${done ? ' (выполнено)' : ''}`}
                aria-current={isCur ? 'step' : undefined}
                className="block w-full py-2"
                onClick={() => onGo(i)}
              >
                <span
                  aria-hidden
                  className={`block h-1.5 rounded-full transition-colors duration-300 ${
                    isCur
                      ? 'animate-pulse-soft bg-accent/40 ring-2 ring-accent motion-reduce:animate-none'
                      : done
                        ? 'bg-accent'
                        : 'bg-surface-3'
                  }`}
                />
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** The focused exercise: header + actions, technique, last time, sets, and the big finish-set / rest area. */
function GuidedExerciseCard({
  sessionId,
  exIdx,
  exercise,
  libraryExercise,
  last,
  hideMedia,
  celebrateKey,
  hasNext,
  timer,
  onSetDone,
  onFinishSet,
  onNext,
  onReplace,
  onRemove,
  onFinishSession,
}: {
  sessionId: string
  exIdx: number
  exercise: SessionExercise
  libraryExercise?: Exercise
  last: PastPerformance | null
  hideMedia: boolean
  celebrateKey: number | null
  hasNext: boolean
  timer: ReactNode
  onSetDone: (setIdx: number) => void
  onFinishSet: () => void
  onNext: () => void
  onReplace: () => void
  onRemove: () => void
  onFinishSession: () => void
}) {
  const [techniqueOpen, setTechniqueOpen] = useState(false)
  const nextSet = nextUndoneSet(exercise)
  const doneCount = exercise.sets.filter((s) => s.done).length
  const complete = exercise.sets.length > 0 && nextSet < 0
  const resting = timer != null

  return (
    <Card
      as="article"
      padding="sm"
      aria-label={exercise.name}
      className={`relative transition-[border-color] duration-300 ${complete ? 'border-accent/40' : ''}`}
    >
      <div className="flex items-start gap-3">
        {hideMedia && libraryExercise?.images[0] ? (
          <TechniqueThumb
            name={exercise.name}
            libraryExercise={libraryExercise}
            onOpen={() => setTechniqueOpen(true)}
          />
        ) : (
          <span
            aria-hidden
            className={`grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold tabular-nums transition-colors ${
              complete ? 'bg-accent text-bg' : 'bg-accent/15 text-accent'
            }`}
          >
            {complete ? <Icon name="check" size={18} strokeWidth={2.5} /> : exIdx + 1}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-snug font-semibold tracking-tight">{exercise.name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted tabular-nums">
            <span>{planLine(exercise)}</span>
            <span className={complete ? 'text-accent' : ''}>
              · выполнено {doneCount}/{exercise.sets.length}
            </span>
          </p>
          {exercise.hint && <ExerciseHint hint={exercise.hint} />}
          {exercise.notes && <p className="mt-0.5 text-xs text-muted">{exercise.notes}</p>}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          icon="edit"
          aria-label={`Заменить: ${exercise.name}`}
          onClick={onReplace}
        >
          Заменить
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon="trash"
          aria-label={`Удалить: ${exercise.name}`}
          className="hover:text-danger"
          onClick={onRemove}
        >
          Удалить
        </Button>
        <Link
          to={`/workouts/exercises/${encodeURIComponent(exercise.exerciseId)}`}
          aria-label={`Подробнее: ${exercise.name}`}
          className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-xl px-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-accent"
        >
          <Icon name="info" size={16} />
          Подробнее
        </Link>
      </div>

      {libraryExercise && !hideMedia && !resting && (
        <TechniqueMedia
          name={exercise.name}
          libraryExercise={libraryExercise}
          onOpen={() => setTechniqueOpen(true)}
          mediaClassName="max-h-[160px]"
        />
      )}

      {last && <LastTimeRow sessionId={sessionId} exIdx={exIdx} last={last} />}

      <WarmupChips sessionId={sessionId} exIdx={exIdx} exercise={exercise} />
      <SetList
        sessionId={sessionId}
        exIdx={exIdx}
        exercise={exercise}
        onSetDone={onSetDone}
        highlightIdx={resting ? undefined : nextSet}
      />
      <div className="mt-1 flex justify-end">
        <Button size="sm" variant="ghost" icon="plus" onClick={() => void addSet(sessionId, exIdx)}>
          Подход
        </Button>
      </div>

      {complete && (
        <div className="relative mt-2">
          {celebrateKey != null && <Confetti key={celebrateKey} count={28} />}
          <motion.p
            role="status"
            initial={celebrateKey != null ? { scale: 0.9, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="flex items-center justify-center gap-2 rounded-2xl bg-accent/12 py-2.5 text-sm font-semibold text-accent"
          >
            <Icon name="check" size={18} strokeWidth={2.5} />
            Упражнение выполнено
          </motion.p>
        </div>
      )}

      <div className="mt-3">
        {timer ??
          (nextSet >= 0 ? (
            <Button size="lg" icon="check" className="w-full" onClick={onFinishSet}>
              Завершить подход {nextSet + 1}
            </Button>
          ) : hasNext ? (
            <Button size="lg" iconRight="chevron-right" className="w-full" onClick={onNext}>
              Следующее упражнение
            </Button>
          ) : complete ? (
            <Button size="lg" icon="check" className="w-full" onClick={onFinishSession}>
              Завершить тренировку
            </Button>
          ) : (
            <p className="text-center text-sm text-muted">Добавьте подход, чтобы начать.</p>
          ))}
      </div>

      {libraryExercise && (
        <ExerciseTechniqueSheet
          open={techniqueOpen}
          onClose={() => setTechniqueOpen(false)}
          title={exercise.name}
          exercise={libraryExercise}
        />
      )}
    </Card>
  )
}

/** Shown when no exercise has sets left: totals + «Завершить тренировку». */
function FinishCard({ session, onFinish }: { session: WorkoutSession; onFinish: () => void }) {
  const sets = doneSetCount(session)
  return (
    <Card variant="accent" className="relative flex flex-col items-center py-8 text-center">
      <Confetti count={32} />
      <IconBadge name="trophy" tone="amber" size="lg" />
      <h2 className="mt-3 text-xl font-semibold tracking-tight">Все упражнения выполнены</h2>
      <p className="mt-1 text-sm text-muted tabular-nums">
        {sets} {plural(sets, ['подход', 'подхода', 'подходов'])} · {int(sessionVolume(session))} кг
      </p>
      <Button size="lg" icon="check" className="mt-5 w-full" onClick={onFinish}>
        Завершить тренировку
      </Button>
    </Card>
  )
}
