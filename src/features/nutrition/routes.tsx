import type { RouteObject } from 'react-router'
import { NutritionPage } from './NutritionPage'
import { PlanPage } from './PlanPage'
import { FoodsPage } from './FoodsPage'

export const nutritionRoutes: RouteObject[] = [
  { path: 'nutrition', element: <NutritionPage /> },
  { path: 'nutrition/plan', element: <PlanPage /> },
  { path: 'nutrition/foods', element: <FoodsPage /> },
]
