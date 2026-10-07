import type { RouteObject } from 'react-router'
import { BookNewPage } from './books/BookNewPage'
import { BookPage } from './books/BookPage'
import { BooksPage } from './books/BooksPage'
import { GrowthPage } from './GrowthPage'
import { HabitEditPage } from './habits/HabitEditPage'
import { HabitsPage } from './habits/HabitsPage'

export const growthRoutes: RouteObject[] = [
  { path: 'growth', element: <GrowthPage /> },
  { path: 'habits', element: <HabitsPage /> },
  { path: 'habits/new', element: <HabitEditPage /> },
  { path: 'habits/:id', element: <HabitEditPage /> },
  { path: 'books', element: <BooksPage /> },
  { path: 'books/new', element: <BookNewPage /> },
  { path: 'books/:id', element: <BookPage /> },
]
