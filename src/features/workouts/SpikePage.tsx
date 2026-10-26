import { useEffect, useRef, useState } from 'react'
import { Button, Card, PageHeader, SegmentedControl } from '../../components/ui'
import {
  applyAudioSession,
  audioReady,
  playTone,
  primeAudio,
  requestWakeLock,
  speak,
  type AudioSessionType,
  type WakeLockHandle,
} from '../../lib/device'

/**
 * TEMPORARY on-device test page for the hands-free gym mode (docs/designs/hands-free-gym.md,
 * Premise 3 / R7 / R8). Run it on the iPhone from the home-screen app with Music playing,
 * write the results into the design doc, then delete this page and its route (task T8).
 */

const PHRASE = 'Отдых две минуты. Дальше: подход три, восемьдесят два с половиной на шесть.'
const DELAY_MS = 60_000

const SESSION_TYPES: { value: AudioSessionType; label: string }[] = [
  { value: 'auto', label: 'не задан' },
  { value: 'transient', label: 'transient' },
  { value: 'ambient', label: 'ambient' },
]

function clock(): string {
  return new Date().toLocaleTimeString('ru-RU', { hour12: false })
}

export function SpikePage() {
  const [log, setLog] = useState<string[]>([])
  const [sessionType, setSessionType] = useState<AudioSessionType>('auto')
  const lock = useRef<WakeLockHandle | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const add = (line: string) => setLog((l) => [`${clock()}  ${line}`, ...l].slice(0, 200))
  const audioState = () => `audio ${audioReady() ? 'running' : 'not running'}`

  const takeLock = async () => {
    lock.current?.release()
    const l = await requestWakeLock()
    lock.current = l
    add(`wake lock: ${l.status}`)
    l.onRelease(() => add('wake lock: released by the system'))
  }

  useEffect(() => {
    const onVisibility = () => {
      add(`visibility: ${document.visibilityState}; ${audioState()}`)
      if (document.visibilityState === 'visible' && lock.current) void takeLock()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const pending = timers.current
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      pending.forEach(clearTimeout)
      lock.current?.release()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const later = (label: string, fn: () => string) => {
    add(`${label}: scheduled in 60 s (do not touch the phone)`)
    timers.current.push(setTimeout(() => add(`${label}: ${fn()}`), DELAY_MS))
  }

  const say = () => {
    const ok = speak(PHRASE)
    return `speak() → ${ok}; speaking=${typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking}`
  }

  return (
    <>
      <PageHeader title="Тест звука" eyebrow="Временная страница" back="/workouts" />
      <Card className="mb-3 space-y-2 text-sm">
        <p className="text-muted">
          Каждый пункт: Музыка играет в наушниках, приложение открыто с экрана «Домой». Повторить
          при звонке вкл и выкл (переключатель / Action-кнопка). Записать: музыка смешалась,
          приглушилась или встала на паузу.
        </p>
        <SegmentedControl
          aria-label="Тип аудиосессии"
          size="sm"
          value={sessionType}
          onChange={(v) => {
            setSessionType(v)
            applyAudioSession(v)
            add(`audioSession.type = ${v}`)
          }}
          options={SESSION_TYPES}
        />
      </Card>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => void takeLock()}>
          Wake lock
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            primeAudio()
            add(`prime → ${audioState()}`)
          }}
        >
          Прогреть звук
        </Button>
        <Button variant="secondary" onClick={() => add(`phrase now: ${say()}`)}>
          Фраза сейчас
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            add(`phrase in gesture: ${say()}`)
            later('phrase from timer', say)
          }}
        >
          Фраза + через 60 с
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            primeAudio()
            add(`tone now: ${playTone('go')}; ${audioState()}`)
          }}
        >
          Тон сейчас
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            primeAudio()
            later('tone from timer', () => `${playTone('go')}; ${audioState()}`)
          }}
        >
          Тон через 60 с
        </Button>
      </div>
      <Card padding="sm">
        <ol aria-label="Журнал" className="space-y-1 font-mono text-xs tabular-nums">
          {log.length === 0 ? (
            <li className="text-muted">Пусто</li>
          ) : (
            log.map((l, i) => <li key={i}>{l}</li>)
          )}
        </ol>
      </Card>
    </>
  )
}
