/**
 * Browser helpers for practice timers: a Web Audio gong (no audio files) and a screen wake
 * lock. Every API is feature-detected — jsdom and older browsers simply get no sound.
 */

type AudioCtor = typeof AudioContext

let ctx: AudioContext | null = null

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

/** Create/resume the audio context inside a user gesture so the final gong may play (iOS). */
export function primeAudio(): void {
  const c = getContext()
  if (c && c.state === 'suspended') c.resume().catch(() => undefined)
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

export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern)
}

interface WakeLockSentinelLike {
  release: () => Promise<void>
}

/** Keep the screen on while a timer runs; returns a release function (no-op when unsupported). */
export async function requestWakeLock(): Promise<() => void> {
  const nav = typeof navigator !== 'undefined' ? (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }) : undefined
  if (!nav?.wakeLock) return () => undefined
  try {
    const sentinel = await nav.wakeLock.request('screen')
    return () => {
      sentinel.release().catch(() => undefined)
    }
  } catch {
    return () => undefined
  }
}
