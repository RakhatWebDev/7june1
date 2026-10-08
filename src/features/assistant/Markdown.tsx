import type { ReactNode } from 'react'

/** Inline markdown: **bold**, *italic*, `code`. Everything else is plain text (no HTML). */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*)\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${keyBase}-${i++}`
    if (m[1] != null)
      out.push(
        <strong key={key} className="font-semibold text-text">
          {m[1]}
        </strong>,
      )
    else if (m[2] != null)
      out.push(
        <code key={key} className="rounded bg-surface-3 px-1 text-[0.9em]">
          {m[2]}
        </code>,
      )
    else out.push(<em key={key}>{m[3]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const BULLET = /^\s*[-*•]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/

/**
 * Tiny, safe markdown renderer for coach replies: paragraphs, bullet and numbered
 * lists, headings (rendered as bold lines) and inline emphasis. No raw HTML.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let para: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`
      blocks.push(
        <p key={k}>
          {para.flatMap((l, idx) => (idx ? [<br key={`${k}-br${idx}`} />, ...inline(l, `${k}-${idx}`)] : inline(l, `${k}-${idx}`)))}
        </p>,
      )
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`
      const items = list.items.map((it, idx) => <li key={`${k}-${idx}`}>{inline(it, `${k}-${idx}`)}</li>)
      blocks.push(
        list.ordered ? (
          <ol key={k} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={k} className="list-disc space-y-1 pl-5 marker:text-muted">
            {items}
          </ul>
        ),
      )
      list = null
    }
  }

  for (const line of lines) {
    if (!line.trim()) {
      flushPara()
      flushList()
      continue
    }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      flushPara()
      flushList()
      blocks.push(
        <p key={`h${blocks.length}`} className="font-semibold text-text">
          {inline(heading[1], `h${blocks.length}`)}
        </p>,
      )
      continue
    }
    const ordered = NUMBERED.test(line)
    if (ordered || BULLET.test(line)) {
      flushPara()
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push(line.replace(ordered ? NUMBERED : BULLET, ''))
      continue
    }
    if (list && /^\s{2,}/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`
      continue
    }
    flushList()
    para.push(line)
  }
  flushPara()
  flushList()
  return <div className="space-y-2 break-words [overflow-wrap:anywhere]">{blocks}</div>
}
