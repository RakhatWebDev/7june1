export interface OpenLibraryHit {
  title: string
  author?: string
  pages?: number
  coverUrl?: string
}

interface SearchDoc {
  title?: string
  author_name?: string[]
  number_of_pages_median?: number
  cover_i?: number
}

export function coverUrl(coverId: number): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
}

export function searchUrl(title: string, author?: string): string {
  const p = new URLSearchParams({ title: title.trim() })
  if (author?.trim()) p.set('author', author.trim())
  p.set('limit', '5')
  return `https://openlibrary.org/search.json?${p.toString()}`
}

/**
 * Looks a book up on Open Library. Never throws: any network/parse error
 * resolves to an empty list so the form simply stays as it was.
 */
export async function searchOpenLibrary(
  title: string,
  author?: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<OpenLibraryHit[]> {
  if (!title.trim() || typeof fetchImpl !== 'function') return []
  try {
    const res = await fetchImpl(searchUrl(title, author))
    if (!res.ok) return []
    const json = (await res.json()) as { docs?: SearchDoc[] }
    return (json.docs ?? []).slice(0, 5).map((d) => ({
      title: d.title ?? title,
      author: d.author_name?.[0],
      pages: d.number_of_pages_median,
      coverUrl: typeof d.cover_i === 'number' ? coverUrl(d.cover_i) : undefined,
    }))
  } catch {
    return []
  }
}
