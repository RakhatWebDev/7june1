import { describe, expect, it, vi } from 'vitest'
import { searchOpenLibrary, searchUrl } from './openLibrary'

describe('searchOpenLibrary', () => {
  it('builds the search URL', () => {
    expect(searchUrl('Atomic Habits', 'James Clear')).toBe(
      'https://openlibrary.org/search.json?title=Atomic+Habits&author=James+Clear&limit=5',
    )
    expect(searchUrl('Дюна')).not.toContain('author=')
  })

  it('maps docs to cover URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        docs: [
          { title: 'Atomic Habits', author_name: ['James Clear'], cover_i: 123, number_of_pages_median: 320 },
          { title: 'No cover' },
        ],
      }),
    })
    const hits = await searchOpenLibrary('Atomic Habits', '', fetchMock as unknown as typeof fetch)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(hits[0]).toEqual({
      title: 'Atomic Habits',
      author: 'James Clear',
      pages: 320,
      coverUrl: 'https://covers.openlibrary.org/b/id/123-M.jpg',
    })
    expect(hits[1].coverUrl).toBeUndefined()
  })

  it('fails silently on network errors and bad responses', async () => {
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await searchOpenLibrary('X', undefined, offline as unknown as typeof fetch)).toEqual([])
    const bad = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    expect(await searchOpenLibrary('X', undefined, bad as unknown as typeof fetch)).toEqual([])
    const garbage = vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('bad json') } })
    expect(await searchOpenLibrary('X', undefined, garbage as unknown as typeof fetch)).toEqual([])
  })
})
