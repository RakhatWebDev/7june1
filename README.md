# FORMA — My Training Process

Личное web-приложение для тренировок.

Локальный (offline-first) PWA «центр личного развития»:

| Вкладка | Модули |
|---|---|
| **Сегодня** | кольца дня (ккал · вода · активность), настроение, тренировка дня, привычки, цели, недельный обзор, календарь занятий |
| **Тренировки** | зал по программе (David Laid DUP, 6 дней) с демонстрацией упражнений и логом подходов, таймер отдыха, рекорды, библиотека 876 упражнений; кардио (бег, вело, бассейн, скакалка, ходьба), растяжка с таймером, история, календарь OneFit (импорт .ics / подписка) |
| **Питание** | норма по Mifflin–St Jeor, дневник по приёмам пищи, 44 встроенных продукта + свои, вода |
| **Развитие** | привычки с авто-отметками из данных, книги с логом чтения и цитатами, разум и дух (настроение с инсайтами, благодарность, дневник, медитация с гонгом, дыхание), финансы (расходы, бюджеты, подписки, накопления), цели по 7 сферам с колесом баланса и воскресным обзором, сон |
| **Прогресс** | вес со скользящим средним, замеры, объём по неделям, рекорды (1RM), серия активности |

Превью ветки разработки: https://invite-git-claude-nice-babbage-bj84b7-rakhats-projects-77e0f0e6.vercel.app

- Стек: Vite · React 19 · TypeScript · Tailwind v4 · Dexie (IndexedDB) · React Router (hash) · Recharts · motion · Vitest
- Данные хранятся только в браузере (IndexedDB), бэкенда нет. Экспорт/импорт в JSON.
- База упражнений: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense), 876 упражнений с кадрами.
- Деплой: Vercel (превью на каждый пуш, `vercel.json`) и GitHub Pages (`.github/workflows/pages.yml`) при пуше в `main`
  (в настройках репозитория: Settings → Pages → Source: GitHub Actions).

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + lint + tests + build
```

## Документы

- [docs/GOALS.md](docs/GOALS.md) — цели продукта и критерии готовности (Definition of Done)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — структура, схема данных, правила для разработчиков/агентов
- [docs/TASKS.md](docs/TASKS.md) — нарезка задач по агентам с acceptance-критериями
- [docs/PROGRAM_DAVID_LAID.md](docs/PROGRAM_DAVID_LAID.md) — встроенная программа и источники
