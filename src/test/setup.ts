import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Report `prefers-reduced-motion: reduce` so motion-based
// primitives (Sheet, Stepper, CountUp, page transitions…) render statically and
// deterministically in tests — no exit animations keeping old nodes in the DOM.
if (typeof window !== 'undefined') {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion') && !query.includes('no-preference'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

afterEach(() => cleanup())
