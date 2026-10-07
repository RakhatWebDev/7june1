import type { RouteObject } from 'react-router'
import { ExerciseDetailPage } from './ExerciseDetailPage'
import { ExerciseLibraryPage } from './ExerciseLibraryPage'
import { HistoryPage } from './HistoryPage'
import { ProgramDetailPage } from './ProgramDetailPage'
import { ProgramsPage } from './ProgramsPage'
import { SessionPage } from './SessionPage'
import { StartSessionPage } from './StartSessionPage'

export const workoutsRoutes: RouteObject[] = [
  { path: 'workouts', element: <ProgramsPage /> },
  { path: 'workouts/programs/:id', element: <ProgramDetailPage /> },
  { path: 'workouts/start/:programId/:dayId', element: <StartSessionPage /> },
  { path: 'workouts/session/:id', element: <SessionPage /> },
  { path: 'workouts/history', element: <HistoryPage /> },
  { path: 'workouts/exercises', element: <ExerciseLibraryPage /> },
  { path: 'workouts/exercises/:id', element: <ExerciseDetailPage /> },
]
