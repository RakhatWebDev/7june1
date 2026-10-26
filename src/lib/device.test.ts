import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Device = typeof import('./device')

/** Fresh module per test: the audio context and the speech warm-up flag are module-level. */
async function load(): Promise<Device> {
  vi.resetModules()
  return import('./device')
}

const frequencies: number[] = []
let contextState = 'running'
let resumeCalls = 0

class FakeParam {
  setValueAtTime(v: number) {
    frequencies.push(v)
  }
  exponentialRampToValueAtTime() {}
}
class FakeNode {
  gain = new FakeParam()
  frequency = new FakeParam()
  type = ''
  connect() {}
  start() {}
  stop() {}
}
class FakeAudioContext {
  get state() {
    return contextState
  }
  currentTime = 0
  destination = {}
  createOscillator() {
    return new FakeNode()
  }
  createGain() {
    return new FakeNode()
  }
  resume() {
    resumeCalls++
    contextState = 'running'
    return Promise.resolve()
  }
}

beforeEach(() => {
  frequencies.length = 0
  contextState = 'running'
  resumeCalls = 0
})
afterEach(() => vi.unstubAllGlobals())

describe('requestWakeLock', () => {
  it('reports unsupported when the API is missing', async () => {
    vi.stubGlobal('navigator', {})
    const { requestWakeLock } = await load()
    const lock = await requestWakeLock()
    expect(lock.status).toBe('unsupported')
    expect(() => lock.release()).not.toThrow()
  })

  it('reports denied when the request is rejected', async () => {
    vi.stubGlobal('navigator', {
      wakeLock: { request: () => Promise.reject(new Error('NotAllowedError')) },
    })
    const { requestWakeLock } = await load()
    expect((await requestWakeLock()).status).toBe('denied')
  })

  it('holds the lock, releases it, and reports a system release', async () => {
    const listeners: (() => void)[] = []
    const sentinel = {
      release: vi.fn(() => Promise.resolve()),
      addEventListener: (type: string, cb: () => void) => {
        if (type === 'release') listeners.push(cb)
      },
    }
    vi.stubGlobal('navigator', { wakeLock: { request: vi.fn(() => Promise.resolve(sentinel)) } })
    const { requestWakeLock } = await load()
    const lock = await requestWakeLock()
    expect(lock.status).toBe('on')
    const onRelease = vi.fn()
    lock.onRelease(onRelease)
    listeners.forEach((cb) => cb())
    expect(onRelease).toHaveBeenCalledTimes(1)
    lock.release()
    expect(sentinel.release).toHaveBeenCalledTimes(1)
  })
})

describe('audio', () => {
  it('resumes an interrupted context, not only a suspended one', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const { primeAudio, audioReady } = await load()
    contextState = 'interrupted'
    expect(audioReady()).toBe(false)
    primeAudio()
    expect(resumeCalls).toBe(1)
    await Promise.resolve()
    expect(audioReady()).toBe(true)
  })

  it('does not resume a running context', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const { primeAudio } = await load()
    primeAudio()
    expect(resumeCalls).toBe(0)
  })

  it('is not ready without Web Audio', async () => {
    const { audioReady, playTone } = await load()
    vi.stubGlobal('AudioContext', undefined)
    expect(audioReady()).toBe(false)
    expect(playTone('go')).toBe(false)
  })

  it('plays distinct tones: one for warn, two for go, a short one for confirm', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const { playTone } = await load()
    expect(playTone('warn')).toBe(true)
    expect(frequencies.filter((f) => f === 660)).toHaveLength(1)
    expect(playTone('go')).toBe(true)
    expect(frequencies.filter((f) => f === 880)).toHaveLength(2)
    expect(playTone('confirm')).toBe(true)
    expect(frequencies.filter((f) => f === 520)).toHaveLength(1)
  })

  it('does not play into a context that is not running', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const { playTone } = await load()
    contextState = 'interrupted'
    expect(playTone('go')).toBe(false)
    expect(frequencies).toHaveLength(0)
  })
})

describe('speech', () => {
  class FakeUtterance {
    lang = ''
    voice: unknown = null
    rate = 1
    text: string
    constructor(text: string) {
      this.text = text
    }
  }
  const synth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: () => [
      { lang: 'en-US', name: 'Samantha' },
      { lang: 'ru-RU', name: 'Milena' },
    ],
  }

  beforeEach(() => {
    synth.speak.mockReset()
    synth.cancel.mockReset()
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    vi.stubGlobal('speechSynthesis', synth)
  })

  it('cancels the queue, then speaks Russian with a Russian voice', async () => {
    const { speak } = await load()
    expect(speak('Подход три')).toBe(true)
    expect(synth.cancel).toHaveBeenCalledBefore(synth.speak)
    const u = synth.speak.mock.calls[0][0] as FakeUtterance
    expect(u.text).toBe('Подход три')
    expect(u.lang).toBe('ru-RU')
    expect(u.voice).toMatchObject({ name: 'Milena' })
  })

  it('warms speech only once per page', async () => {
    const { warmSpeech } = await load()
    warmSpeech()
    warmSpeech()
    expect(synth.speak).toHaveBeenCalledTimes(1)
  })

  it('cancelSpeech clears the queue', async () => {
    const { cancelSpeech } = await load()
    cancelSpeech()
    expect(synth.cancel).toHaveBeenCalledTimes(1)
  })

  it('is a no-op without the Speech API', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const { speak, cancelSpeech, warmSpeech } = await load()
    expect(speak('x')).toBe(false)
    expect(() => {
      cancelSpeech()
      warmSpeech()
    }).not.toThrow()
  })
})

describe('audio session', () => {
  it('sets the iOS audio session type when the API exists', async () => {
    const session = { type: 'auto' }
    vi.stubGlobal('navigator', { audioSession: session })
    const { applyAudioSession, AUDIO_SESSION_TYPE } = await load()
    applyAudioSession()
    expect(session.type).toBe(AUDIO_SESSION_TYPE)
    applyAudioSession('ambient')
    expect(session.type).toBe('ambient')
  })

  it('ignores browsers without it', async () => {
    vi.stubGlobal('navigator', {})
    const { applyAudioSession } = await load()
    expect(() => applyAudioSession()).not.toThrow()
  })
})
