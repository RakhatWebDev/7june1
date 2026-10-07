import type { RouteObject } from 'react-router'
import { CardioPage } from './CardioPage'
import { NewActivityPage } from './NewActivityPage'
import { StretchListPage } from './StretchListPage'
import { StretchRunPage } from './StretchRunPage'

export const cardioRoutes: RouteObject[] = [
  { path: 'cardio', element: <CardioPage /> },
  { path: 'cardio/new', element: <NewActivityPage /> },
  { path: 'cardio/stretch', element: <StretchListPage /> },
  { path: 'cardio/stretch/:id', element: <StretchRunPage /> },
]
