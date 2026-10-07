import { useEffect, useState } from 'react'
import { exerciseImageUrl } from '../data/exercises'
import type { Exercise } from '../db/types'

/**
 * Shows the exercise demo: free-exercise-db ships two frames (start / end position).
 * We alternate them to get a simple "animation". Click toggles pause.
 */
export function ExerciseMedia({
  exercise,
  intervalMs = 900,
  className = '',
}: {
  exercise: Pick<Exercise, 'name' | 'images'>
  intervalMs?: number
  className?: string
}) {
  const [frame, setFrame] = useState(0)
  const [paused, setPaused] = useState(false)
  const frames = exercise.images
  useEffect(() => {
    if (paused || frames.length < 2) return
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), intervalMs)
    return () => clearInterval(t)
  }, [paused, frames.length, intervalMs])

  if (frames.length === 0) {
    return (
      <div className={`flex aspect-[4/3] items-center justify-center rounded-2xl bg-surface-2 text-muted ${className}`}>
        Нет изображения
      </div>
    )
  }
  return (
    <button
      type="button"
      aria-label={paused ? 'Продолжить анимацию' : 'Пауза'}
      onClick={() => setPaused((p) => !p)}
      className={`relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white ${className}`}
    >
      {frames.map((src, i) => (
        <img
          key={src}
          src={exerciseImageUrl(src)}
          alt={`${exercise.name} — кадр ${i + 1}`}
          loading={i === 0 ? 'eager' : 'lazy'}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${
            i === frame ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}
      <span className="absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
        {paused ? '▶' : `${frame + 1}/${frames.length}`}
      </span>
    </button>
  )
}
