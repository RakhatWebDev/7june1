import { useEffect, useRef, useState } from 'react'
import type { SessionExercise } from '../../db/types'
import { playTone, requestWakeLock, speak, type WakeLockHandle } from '../../lib/device'
import type { PastPerformance } from './calc'
import type { NextSetCue } from './cues'
import { nextPending, nextUndoneSet } from './guided'

/* ------------------------------------------------------------------ */
/* Hands-free («скамья») mode of the guided session: which set a tap   */
/* records, what the voice announces next, the rest tones and the      */
/* session-long screen wake lock. docs/designs/hands-free-gym.md       */
/* ------------------------------------------------------------------ */

/** 'voice' = tones + phrase at the tap; 'tone' = tones only; 'screen' = no sound; 'off' = classic card. */
export type HandsFreeMode = 'voice' | 'tone' | 'screen' | 'off'

export interface SetRef {
  exIdx: number
  setIdx: number
  /** `setIdx` points into `warmups` instead of `sets` */
  warmup?: boolean
}

/** The first set to do in `ex`: its undone warm-ups until a working set is done, then the next working set. */
function firstOf(ex: SessionExercise, exIdx: number): SetRef | null {
  if (!ex.sets.some((s) => s.done)) {
    const w = (ex.warmups ?? []).findIndex((s) => !s.done)
    if (w >= 0) return { exIdx, setIdx: w, warmup: true }
  }
  const i = nextUndoneSet(ex)
  return i >= 0 ? { exIdx, setIdx: i } : null
}

/**
 * The set a bench tap records: the next set of the current exercise (warm-ups first), else the first
 * set of the next pending exercise (early tap during the rest after a last set), else nothing.
 */
export function tapTarget(exercises: SessionExercise[], cur: number): SetRef | null {
  const ex = exercises[cur]
  const here = ex ? firstOf(ex, cur) : null
  if (here) return here
  const n = nextPending(exercises, cur)
  return n >= 0 ? firstOf(exercises[n], n) : null
}

function markDone(ex: SessionExercise, setIdx: number, warmup: boolean): SessionExercise {
  const done = <T extends { done: boolean }>(list: T[]) =>
    list.map((s, j) => (j === setIdx ? { ...s, done: true } : s))
  return warmup ? { ...ex, warmups: done(ex.warmups ?? []) } : { ...ex, sets: done(ex.sets) }
}

/** The set after `exIdx/setIdx` once that set counts as done (the data may not have updated yet). */
export function nextAfter(
  exercises: SessionExercise[],
  exIdx: number,
  setIdx: number,
  warmup = false,
): SetRef | null {
  if (!exercises[exIdx]) return null
  const marked = exercises.map((e, i) => (i === exIdx ? markDone(e, setIdx, warmup) : e))
  const here = firstOf(marked[exIdx], exIdx)
  if (here) return here
  const n = nextPending(marked, exIdx)
  return n >= 0 ? firstOf(marked[n], n) : null
}

export type RestCue = 'warn' | 'go'

const GO_PHRASE_DELAY_MS = 900

/**
 * Which rest tone is due now. `warn` once while 3–10 s are left (rests over 15 s only), `go` once at
 * zero; after a return from the background a `go` older than a minute is dropped.
 */
export function nextCue(s: {
  remainingSec: number
  overdueMs: number
  totalSec: number
  warned: boolean
  went: boolean
}): RestCue | null {
  if (s.remainingSec <= 0) return !s.went && s.overdueMs <= 60_000 ? 'go' : null
  if (!s.warned && s.totalSec > 15 && s.remainingSec <= 10 && s.remainingSec >= 3) return 'warn'
  return null
}

/** What the voice says about `target`: planned load, plan reps and the same set last time. */
export function cueForTarget(
  exercises: SessionExercise[],
  target: SetRef | null,
  lasts: (PastPerformance | null)[],
  fromExIdx: number,
): NextSetCue | null {
  if (!target) return null
  const ex = exercises[target.exIdx]
  if (ex && target.warmup) {
    const w = ex.warmups?.[target.setIdx]
    if (!w) return null
    return {
      ...(target.exIdx !== fromExIdx ? { exerciseName: ex.name } : {}),
      warmup: true,
      setNo: target.setIdx + 1,
      weightKg: w.weightKg ? w.weightKg : null,
      reps: w.reps != null ? String(w.reps) : null,
      last: null,
    }
  }
  const set = ex?.sets[target.setIdx]
  if (!ex || !set) return null
  const planned = ex.targets?.[target.setIdx]
  const prev = lasts[target.exIdx]?.sets[target.setIdx]
  const weight = set.weightKg ?? planned?.weightKg ?? prev?.weightKg ?? null
  return {
    ...(target.exIdx !== fromExIdx ? { exerciseName: ex.name } : {}),
    setNo: target.setIdx + 1,
    weightKg: weight ? weight : null,
    reps: planned?.reps ?? ex.targetReps ?? null,
    last: prev ? { weightKg: prev.weightKg ? prev.weightKg : null, reps: prev.reps } : null,
  }
}

/**
 * Plays the rest tones for the current rest. The single owner of rest cues: it reads the wall-clock
 * `endsAt`, so it works whether the bench view or the classic card shows the timer. `played` keeps
 * `${restKey}:${cue}` across remounts (undo restoring an earlier rest must not replay its tones).
 */
export function useRestCues({
  restKey,
  endsAt,
  totalSec,
  mode,
  played,
  goPhrase,
}: {
  restKey: number | null
  endsAt: number | null
  totalSec: number
  mode: HandsFreeMode
  played: Set<string>
  /** Voice mode: said after the end-of-rest tones (iOS may refuse speech from a timer; tones still play) */
  goPhrase?: string
}) {
  const phraseRef = useRef(goPhrase)
  useEffect(() => {
    phraseRef.current = goPhrase
  })
  useEffect(() => {
    if (restKey == null || endsAt == null || mode === 'off') return
    const tick = () => {
      const now = Date.now()
      const cue = nextCue({
        remainingSec: Math.max(0, Math.ceil((endsAt - now) / 1000)),
        overdueMs: Math.max(0, now - endsAt),
        totalSec,
        warned: played.has(`${restKey}:warn`),
        went: played.has(`${restKey}:go`),
      })
      if (!cue) return
      played.add(`${restKey}:${cue}`)
      if (cue === 'go') played.add(`${restKey}:warn`)
      if (mode === 'voice' || mode === 'tone') playTone(cue)
      const phrase = phraseRef.current
      // After the two beeps (≈0.75 s), so speech does not cut them off.
      if (cue === 'go' && mode === 'voice' && phrase)
        setTimeout(() => speak(phrase), GO_PHRASE_DELAY_MS)
    }
    tick()
    const t = setInterval(tick, 250)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [restKey, endsAt, totalSec, mode, played])
}

export type WakeState = 'idle' | 'on' | 'unsupported' | 'denied' | 'released'

/** Keeps the screen on while `enabled`; re-acquires when the page becomes visible again. */
export function useSessionWakeLock(enabled: boolean): WakeState {
  const [state, setState] = useState<WakeState>('idle')
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let handle: WakeLockHandle | null = null
    const acquire = async () => {
      const h = await requestWakeLock()
      if (cancelled) {
        h.release()
        return
      }
      handle?.release()
      handle = h
      setState(h.status)
      h.onRelease(() => {
        if (!cancelled && handle === h) setState('released')
      })
    }
    void acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      handle?.release()
    }
  }, [enabled])
  return enabled ? state : 'idle'
}
