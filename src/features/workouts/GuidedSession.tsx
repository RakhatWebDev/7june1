import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Button, Card, Confetti, EmptyState, IconBadge } from '../../components/ui'
import { Icon } from '../../components/icons'
import { useReduceMotion } from '../../components/ui/helpers'
import type { Exercise, SessionExercise, WorkoutSession } from '../../db/types'
import { int, plural } from '../../lib/format'
import { addSet, removeExercise, updateSet } from './actions'
import { BigRestTimer } from './BigRestTimer'
import { doneSetCount, sessionVolume, type PastPerformance } from './calc'
import { ConfirmSheet } from './ConfirmSheet'
import { ExerciseTechniqueSheet } from './ExerciseTechniqueSheet'
import { finishSetPatch, firstPending, isPending, nextPending, nextUndoneSet } from './guided'
import { planLine } from './labels'
import { ExerciseHint, LastTimeRow, SetList, TechniqueMedia, TechniqueThumb } from './SessionExerciseCard'

const DEFAULT_REST_SEC = 90
/** Pause on the «time is up» state before moving on to the next exercise */
const AUTO_ADVANCE_MS = 1500
const EASE_OUT = [0.22, 1, 0.36, 1] as const

interface Rest {
  key: number
  sec: number
  /** Exercise whose set started the rest */
  exIdx: number
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
}: {
  session: WorkoutSession
  /** Last performance per exercise index */
  lasts: (PastPerformance | null)[]
  library: Map<string, Exercise>
  hideMedia: boolean
  onReplace: (exIdx: number) => void
  onAddExercise: () => void
  onFinish: () => void
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

  const pending = firstPending(exs)
  const cur: number | 'done' = focus != null && focus < exs.length ? focus : pending >= 0 ? pending : 'done'
  const curEx = cur === 'done' ? undefined : exs[cur]

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
    setRest({ key: Date.now(), sec: restChoice ?? ex.restSec ?? DEFAULT_REST_SEC, exIdx })
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
        <EmptyState icon="dumbbell" title="В тренировке нет упражнений" hint="Добавьте упражнение из библиотеки." />
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
                setRest({ ...rest, sec, key: Date.now() })
              }}
            />
          ) : null
        }
      />
    )

  const bodyKey = cur === 'done' ? 'done' : `${cur}-${curEx?.exerciseId}`

  return (
    <>
      <ProgressStrip exercises={exs} current={cur} onGo={(i) => goTo(i, cur === 'done' || i > cur ? 1 : -1)} />
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
              exit: (d: number) => ({ opacity: 0, x: d * -48, transition: { duration: 0.16, ease: 'easeIn' } }),
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
        <p className="flex-1 text-center text-sm font-medium tabular-nums" data-testid="guided-position">
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
          <TechniqueThumb name={exercise.name} libraryExercise={libraryExercise} onOpen={() => setTechniqueOpen(true)} />
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
        <Button size="sm" variant="secondary" icon="edit" aria-label={`Заменить: ${exercise.name}`} onClick={onReplace}>
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
