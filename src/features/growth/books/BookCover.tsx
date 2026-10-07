import { useState } from 'react'
import type { Book } from '../../../db/types'
import { colorVar, tint } from '../shared'
import { initials, placeholderColor } from './calc'

const SIZES = {
  sm: 'w-12 h-[4.5rem] text-sm',
  md: 'w-16 h-24 text-base',
  lg: 'w-24 h-36 text-2xl',
}

/** Book cover image, or a coloured placeholder with initials. */
export function BookCover({ book, size = 'md' }: { book: Pick<Book, 'title' | 'coverUrl'>; size?: keyof typeof SIZES }) {
  const [failed, setFailed] = useState(false)
  const cls = `${SIZES[size]} shrink-0 overflow-hidden rounded-lg border border-border`
  if (book.coverUrl && !failed) {
    return <img src={book.coverUrl} alt="" loading="lazy" className={`${cls} object-cover`} onError={() => setFailed(true)} />
  }
  const c = placeholderColor(book.title)
  return (
    <div
      aria-hidden
      data-testid="cover-placeholder"
      className={`${cls} grid place-items-center font-bold tracking-tight`}
      style={{ color: colorVar(c), backgroundColor: tint(c, 18) }}
    >
      {initials(book.title)}
    </div>
  )
}
