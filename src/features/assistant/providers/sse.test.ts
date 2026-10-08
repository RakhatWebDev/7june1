import { describe, expect, it } from 'vitest'
import { compactJson, parseSse, streamFromChunks } from './sse'

describe('parseSse', () => {
  it('handles split chunks, CRLF, comments, multi-line data and a missing final blank line', async () => {
    const out = []
    for await (const m of parseSse(
      streamFromChunks([': ping\r\n', 'event: a\r\nda', 'ta: 1\r\ndata: 2\r\n\r\n', 'data: {"x":1}\n\n', 'data: tail']),
    ))
      out.push(m)
    expect(out).toEqual([
      { event: 'a', data: '1\n2' },
      { event: 'message', data: '{"x":1}' },
      { event: 'message', data: 'tail' },
    ])
  })

  it('caps oversized tool output', () => {
    expect(compactJson({ a: 1 })).toBe('{"a":1}')
    expect(JSON.parse(compactJson('x'.repeat(50), 10))).toMatchObject({ truncated: true })
  })
})
