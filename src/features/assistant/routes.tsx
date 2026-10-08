import type { RouteObject } from 'react-router'
import { AssistantPage } from './AssistantPage'
import { AssistantSettingsPage } from './AssistantSettingsPage'

export const assistantRoutes: RouteObject[] = [
  { path: 'assistant', element: <AssistantPage /> },
  { path: 'assistant/settings', element: <AssistantSettingsPage /> },
]
