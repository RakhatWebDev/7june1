# FORMA — My Training Process

Личное web-приложение для тренировок.

Локальный (offline-first) PWA-дневник: силовые тренировки с демонстрацией упражнений и логированием подходов,
кардио (бег, велосипед, бассейн, скакалка), растяжка, питание (КБЖУ, вода, вес), сон и прогресс.

- Стек: Vite · React 19 · TypeScript · Tailwind v4 · Dexie (IndexedDB) · React Router (hash) · Recharts · Vitest
- Данные хранятся только в браузере (IndexedDB), бэкенда нет. Экспорт/импорт в JSON.
- База упражнений: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense), 876 упражнений с кадрами.
- Деплой: GitHub Pages (`.github/workflows/pages.yml`) при пуше в `main`.

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
