import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './index.css'
import { router } from './app/router'
import { ensureSeeded } from './db/seed'

// Seed built-in data before the first render so deep links (e.g. /workouts/start/...)
// never race the seed. If IndexedDB is unavailable the app still renders.
ensureSeeded()
  .catch((e: unknown) => console.error('seed failed', e))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    )
  })
