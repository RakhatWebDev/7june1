import { createHashRouter, Navigate } from 'react-router'
import { Layout } from './Layout'
import { TodayPage } from '../features/today/TodayPage'
import { workoutsRoutes } from '../features/workouts/routes'
import { cardioRoutes } from '../features/cardio/routes'
import { nutritionRoutes } from '../features/nutrition/routes'
import { sleepRoutes } from '../features/sleep/routes'
import { progressRoutes } from '../features/progress/routes'
import { SettingsPage } from '../features/settings/SettingsPage'
import { calendarRoutes } from '../features/calendar/routes'
import { growthRoutes } from '../features/growth/routes'
import { financeRoutes } from '../features/finance/routes'
import { mindRoutes } from '../features/mind/routes'
import { goalsRoutes } from '../features/goals/routes'

/**
 * Route map (hash router, so it works on GitHub Pages without a 404 fallback):
 *
 *   /                         Сегодня — дашборд дня
 *   /workouts                 Программы + начать тренировку
 *   /workouts/programs/:id    Детали программы (дни, упражнения)
 *   /workouts/session/:id     Активная/прошедшая тренировка (логирование подходов)
 *   /workouts/exercises       Библиотека упражнений (поиск, фильтры)
 *   /workouts/exercises/:id   Карточка упражнения (анимация, инструкция, история)
 *   /workouts/history         История тренировок
 *   /cardio                   Кардио и активности (бег, вело, бассейн, скакалка, растяжка)
 *   /cardio/new               Новая активность
 *   /cardio/stretch           Комплексы растяжки
 *   /nutrition                Питание: дневник дня, КБЖУ, вода
 *   /nutrition/foods          Мои продукты
 *   /nutrition/plan           Расчёт нормы (TDEE, макросы)
 *   /sleep                    Сон
 *   /progress                 Прогресс: вес, замеры, объём, рекорды
 *   /growth                   Развитие — хаб: привычки, книги, сон
 *   /habits                   Трекер привычек (сегодня, неделя, статистика)
 *   /habits/new, /habits/:id  Создание / редактирование привычки
 *   /books                    Книжная полка: читаю / хочу / прочитано
 *   /books/new, /books/:id    Добавить книгу / карточка книги с логом чтения и заметками
 *   /finance                  Финансы: месяц, расходы/доходы, бюджеты, подписки, накопления
 *   /finance/new, /finance/budgets, /finance/recurring, /finance/savings
 *   /mind                     Разум и дух: настроение, благодарность, дневник, медитация, дыхание, вечерний обзор
 *   /mind/checkin, /mind/journal, /mind/journal/:id, /mind/meditate, /mind/breathe, /mind/review
 *   /goals                    Цели по сферам жизни с ключевыми результатами
 *   /goals/new, /goals/:id, /goals/review (еженедельный обзор), /goals/review/:weekStart
 *   /calendar                 Календарь: занятия из OneFit (импорт .ics / подписка), ближайшие
 *   /settings                 Профиль и настройки, экспорт/импорт
 *
 * Each feature owns its `routes.tsx` and may add nested routes freely.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <TodayPage /> },
      ...workoutsRoutes,
      ...cardioRoutes,
      ...nutritionRoutes,
      ...sleepRoutes,
      ...progressRoutes,
      ...calendarRoutes,
      ...growthRoutes,
      ...financeRoutes,
      ...mindRoutes,
      ...goalsRoutes,
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
