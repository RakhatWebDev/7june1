import type { RouteObject } from 'react-router'
import { BreathePage } from './BreathePage'
import { CheckinPage } from './CheckinPage'
import { EveningReviewPage } from './EveningReviewPage'
import { JournalEntryPage } from './JournalEntryPage'
import { JournalPage } from './JournalPage'
import { MeditatePage } from './MeditatePage'
import { MindPage } from './MindPage'

export const mindRoutes: RouteObject[] = [
  { path: 'mind', element: <MindPage /> },
  { path: 'mind/checkin', element: <CheckinPage /> },
  { path: 'mind/journal', element: <JournalPage /> },
  { path: 'mind/journal/new', element: <JournalEntryPage /> },
  { path: 'mind/journal/:id', element: <JournalEntryPage /> },
  { path: 'mind/meditate', element: <MeditatePage /> },
  { path: 'mind/breathe', element: <BreathePage /> },
  { path: 'mind/review', element: <EveningReviewPage /> },
]
