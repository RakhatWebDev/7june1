import type { RouteObject } from 'react-router'
import { SleepNewPage } from './SleepNewPage'
import { SleepPage } from './SleepPage'

export const sleepRoutes: RouteObject[] = [
  { path: 'sleep', element: <SleepPage /> },
  { path: 'sleep/new', element: <SleepNewPage /> },
]
