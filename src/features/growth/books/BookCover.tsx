import { useState } from 'react'
import type { Book } from '../../../db/types'
import { colorVar, tint } from '../shared'
import { initials, placeholderColor } from './calc'

const SIZES = {
  sm: 'w-12 h-[4.5rem] text-sm rounded-md',
  md: 'w-16 h-24 text-base rounded-lg',
  lg: 'w-24 h-36 text-2xl rounded-lg',
}

/** Spine shading + top gloss laid over a cover so it reads as a physical book. */
function Gloss() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(0_0_0/0.28)_0%,rgb(255_255_255/0.10)_6%,transparent_14%),linear-gradient(180deg,rgb(255_255_255/0.08),transparent_40%)]"
    />
  )
}

/** Book cover image, or a coloured placeholder with initials. */
export function BookCover({ book, size = 'md' }: { book: Pick<Book, 'title' | 'coverUrl'>; size?: keyof typeof SIZES }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const frame = `${SIZES[size]} relative shrink-0 overflow-hidden border border-white/[0.08] shadow-[0_8px_18px_-10px_rgb(0_0_0/0.8)]`
  if (book.coverUrl && !failed) {
    return (
      <span className={`${frame} block bg-surface-3`}>
        <img
          src={book.coverUrl}
          alt=""
          loading="lazy"
          className={`size-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
        <Gloss />
      </span>
    )
  }
  const c = placeholderColor(book.title)
  return (
    <div
      aria-hidden
      data-testid="cover-placeholder"
      className={`${frame} grid place-items-center font-bold tracking-tight`}
      style={{
        color: colorVar(c),
        backgroundImage: `linear-gradient(160deg, ${tint(c, 34)}, ${tint(c, 12)})`,
      }}
    >
      {initials(book.title)}
      <Gloss />
    </div>
  )
}
