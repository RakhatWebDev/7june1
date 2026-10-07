import type { RouteObject } from 'react-router'
import { GoalFormPage } from './GoalFormPage'
import { GoalsPage } from './GoalsPage'
import { WeeklyReviewPage } from './WeeklyReviewPage'
import { WeeklyReviewViewPage } from './WeeklyReviewViewPage'

export const goalsRoutes: RouteObject[] = [
  { path: 'goals', element: <GoalsPage /> },
  { path: 'goals/new', element: <GoalFormPage /> },
  { path: 'goals/review', element: <WeeklyReviewPage /> },
  { path: 'goals/review/:weekStart', element: <WeeklyReviewViewPage /> },
  { path: 'goals/:id', element: <GoalFormPage /> },
]
