import type { RouteObject } from 'react-router'
import { GoalsPage } from './GoalsPage'

export const goalsRoutes: RouteObject[] = [{ path: 'goals', element: <GoalsPage /> }]
