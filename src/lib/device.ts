/**
 * Browser helpers shared by practice timers (mind) and the hands-free gym mode (workouts):
 * Web Audio tones and a gong (no audio files), Russian speech, the iOS audio session type and
 * a screen wake lock. Every API is feature-detected — jsdom and older browsers get no-ops.
 */

type AudioCtor = typeof AudioContext

/**
 * iOS audio session for our sounds. `transient` asks to play on top of other audio (Music) instead
 * of pausing it; the gym spike (#/workouts/spike) confirms or replaces this value on a real iPhone.
 */
export const AUDIO_SESSION_TYPE = 'transient'

export type AudioSessionType = 'auto' | 'transient' | 'ambient' | 'playback'

let ctx: AudioContext | null = null
let speechWarmed = false

function audioCtor(): AudioCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
  return w.AudioContext ?? w.webkitAudioContext
}

function getContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = audioCtor()
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    ctx = null
  }
  return ctx
}

/** Set the iOS audio session type (Safari 17+); ignored elsewhere. */
export function applyAudioSession(type: AudioSessionType = AUDIO_SESSION_TYPE): void {
  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as unknown as { audioSession?: { type: string } })
      : undefined
  if (!nav?.audioSession) return
  try {
    nav.audioSession.type = type
  } catch {
    // read-only or unsupported value
  }
}

/**
 * Create/resume the audio context inside a user gesture so later sounds may play (iOS).
 * Resumes any state other than `running`, including iOS `interrupted` after a call or Siri.
 */
export function primeAudio(): void {
  applyAudioSession()
  const c = getContext()
  if (c && c.state !== 'running') c.resume().catch(() => undefined)
}

/** Sounds can play right now: Web Audio exists and its context is running. */
export function audioReady(): boolean {
  if (!audioCtor()) return false
  return getContext()?.state === 'running'
}

/** A soft gong: a 528 Hz sine (plus a quiet overtone) with an exponential fade. */
export function playGong(freq = 528, durationSec = 5): boolean {
  const c = getContext()
  if (!c) return false
  try {
    const t = c.currentTime
    const master = c.createGain()
    master.gain.setValueAtTime(0.0001, t)
    master.gain.exponentialRampToValueAtTime(0.6, t + 0.02)
    master.gain.exponentialRampToValueAtTime(0.0001, t + durationSec)
    master.connect(c.destination)
    for (const [mult, level] of [
      [1, 1],
      [2.76, 0.18],
    ] as const) {
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq * mult, t)
      g.gain.setValueAtTime(level, t)
      osc.connect(g)
      g.connect(master)
      osc.start(t)
      osc.stop(t + durationSec + 0.1)
    }
    return true
  } catch {
    return false
  }
}

export type ToneKind = 'confirm' | 'warn' | 'go'

/** [frequency Hz, start offset s, length s] per beep. */
const TONES: Record<ToneKind, [number, number, number][]> = {
  confirm: [[520, 0, 0.08]],
  warn: [[660, 0, 0.15]],
  go: [
    [880, 0, 0.15],
    [880, 0.25, 0.15],
  ],
}

/** Short beeps for the gym rest timer; false when the context is missing or not running. */
export function playTone(kind: ToneKind): boolean {
  if (!audioReady()) return false
  const c = getContext()
  if (!c) return false
  try {
    const t0 = c.currentTime
    for (const [freq, at, len] of TONES[kind]) {
      const t = t0 + at
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, t)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + len)
      osc.connect(g)
      g.connect(c.destination)
      osc.start(t)
      osc.stop(t + len + 0.05)
    }
    return true
  } catch {
    return false
  }
}

function synth(): SpeechSynthesis | undefined {
  return typeof speechSynthesis !== 'undefined' && speechSynthesis ? speechSynthesis : undefined
}

function russianVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  return s.getVoices().find((v) => v.lang.toLowerCase().startsWith('ru')) ?? null
}

/**
 * Speak a Russian phrase, dropping anything still queued. On iOS this only works inside a user
 * gesture (tap handler), so the gym mode speaks at the tap and uses tones from timers.
 */
export function speak(text: string): boolean {
  const s = synth()
  if (!s || typeof SpeechSynthesisUtterance === 'undefined') return false
  try {
    s.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ru-RU'
    u.voice = russianVoice(s)
    s.speak(u)
    return true
  } catch {
    return false
  }
}

export function cancelSpeech(): void {
  try {
    synth()?.cancel()
  } catch {
    // ignore
  }
}

/** Unlock speech once per page from the first gesture (an empty utterance). */
export function warmSpeech(): void {
  if (speechWarmed) return
  if (speak('')) speechWarmed = true
}

export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function')
    navigator.vibrate(pattern)
}

export type WakeLockStatus = 'on' | 'unsupported' | 'denied'

export interface WakeLockHandle {
  status: WakeLockStatus
  release: () => void
  /** Called when the system drops the lock (tab hidden, Low Power Mode…). */
  onRelease: (cb: () => void) => void
}

interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener?: (type: 'release', cb: () => void) => void
}

const noLock = (status: WakeLockStatus): WakeLockHandle => ({
  status,
  release: () => undefined,
  onRelease: () => undefined,
})

/** Keep the screen on; reports whether the lock was actually granted. */
export async function requestWakeLock(): Promise<WakeLockHandle> {
  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as unknown as {
          wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> }
        })
      : undefined
  if (!nav?.wakeLock) return noLock('unsupported')
  try {
    const sentinel = await nav.wakeLock.request('screen')
    return {
      status: 'on',
      release: () => {
        sentinel.release().catch(() => undefined)
      },
      onRelease: (cb) => sentinel.addEventListener?.('release', cb),
    }
  } catch {
    return noLock('denied')
  }
}
