import type { RouteObject } from 'react-router'
import { ProgressPage } from './ProgressPage'
import { WeightSection } from './WeightSection'
import { MeasurementsSection } from './MeasurementsSection'
import { LoadSection } from './LoadSection'
import { RecordsSection } from './RecordsSection'
import { StreakSection } from './StreakSection'

export const progressRoutes: RouteObject[] = [
  {
    path: 'progress',
    element: <ProgressPage />,
    children: [
      { index: true, element: <WeightSection /> },
      { path: 'measurements', element: <MeasurementsSection /> },
      { path: 'load', element: <LoadSection /> },
      { path: 'records', element: <RecordsSection /> },
      { path: 'streak', element: <StreakSection /> },
    ],
  },
]
