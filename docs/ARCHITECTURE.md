# Архитектура FORMA

## Принципы

1. **Local-first.** Единственное хранилище — IndexedDB через Dexie (`src/db`). Нет сервера, нет аккаунтов.
2. **Feature-folders.** Каждое направление живёт в `src/features/<name>` и владеет своими страницами,
   хуками, расчётами и тестами. Общие вещи — `src/components`, `src/lib`, `src/db`, `src/data`.
3. **Маленькое ядро.** `src/db/types.ts` и `src/db/index.ts` — единый контракт данных. Изменения схемы
   согласуются с архитектором (см. правила ниже).
4. **Реактивность данных.** Чтение из БД через `useLiveQuery` из `dexie-react-hooks`; запись — прямыми
   вызовами `db.<table>.put/add/update/delete`. Никакого глобального стейт-менеджера.
5. **Hash-роутинг** (`createHashRouter`) — чтобы GitHub Pages работал без 404-фолбэка.

## Структура

```
public/data/exercises.json     библиотека упражнений (876, free-exercise-db, обрезанные поля)
public/icons/icon.svg          иконка PWA
src/main.tsx                   вход, сидирование БД
src/app/router.tsx             карта маршрутов (собирает routes.tsx из фич)
src/app/Layout.tsx             оболочка + нижняя навигация (6 вкладок)
src/index.css                  Tailwind v4 + дизайн-токены (@theme)
src/db/types.ts                доменные типы
src/db/index.ts                класс FormaDB (Dexie), экспорт `db`
src/db/seed.ts                 профиль по умолчанию + встроенные программы
src/data/exercises.ts          загрузка библиотеки, useExercises(), URL картинок, словари RU
src/data/programs/             встроенные программы (davidLaidDup.ts)
src/components/ui/index.tsx    Button, Card, PageHeader, Field, Input, Select, Stepper, EmptyState, Stat, Chip, Sheet, Progress
src/components/ExerciseMedia.tsx анимация упражнения (чередование 2 кадров)
src/lib/                       dates.ts (toISODate, today, weekdayIndex, weekDates), format.ts, id.ts
src/features/<feature>/routes.tsx  экспорт RouteObject[] фичи
src/test/setup.ts              fake-indexeddb + jest-dom
```

## Схема данных (Dexie v1)

| Таблица | Ключ | Индексы | Назначение |
|---------|------|---------|------------|
| profile | id (=1) | — | рост, вес, цель, активность, нормы |
| programs | id | name, isBuiltIn | программы с днями и упражнениями |
| sessions | id | startedAt, programId, programDayId | тренировки в зале с подходами |
| activities | id | date, type | кардио/растяжка/прочее |
| foods | id | name | библиотека продуктов (на 100 г) |
| foodEntries | id | date, [date+meal] | записи дневника питания |
| water | id | date | вода (мл) |
| weights | id | date | вес тела |
| measurements | id | date | замеры |
| sleep | id | date | сон |
| settings | key | — | произвольные настройки |

Правило: **новые таблицы или индексы = новая `version(n)` в `FormaDB`** с `upgrade()` при необходимости.
Добавлять *необязательные* поля в существующие интерфейсы можно без миграции.

## Дизайн-система

Тёмная тема, токены в `src/index.css`: `bg`, `surface`, `surface-2`, `border`, `text`, `muted`,
`accent` (лайм), `danger`, `warn`, `info`. Используй классы `bg-surface`, `text-muted`, `border-border`,
`text-accent` и т.д. Радиусы `rounded-2xl` для карточек, `rounded-xl` для контролов. Контент
ограничен `max-w-3xl`, нижняя навигация фиксирована — у страницы уже есть `pb-24`.

Графики — Recharts. Цвет серии по умолчанию `var(--color-accent)`, сетка `var(--color-border)`.

## Правила для агентов-исполнителей

- Работай **только** внутри своей папки `src/features/<feature>/` (плюс свои тесты там же).
  Файлы вне неё (`src/db`, `src/components`, `src/lib`, `src/app`, `package.json`) — **не трогать**;
  если чего-то не хватает, опиши запрос в отчёте архитектору — он внесёт изменение.
  Исключение: `src/features/<feature>/routes.tsx` — твой, добавляй вложенные маршруты как нужно.
- Не делай `git commit` / `git push` — коммитит архитектор.
- Не устанавливай новые зависимости.
- Перед отчётом: `npm run typecheck && npm run lint && npm test` зелёные; `npm run build` проходит.
- Тесты: Vitest + Testing Library, `fake-indexeddb` уже подключён. Для изоляции создавай `new FormaDB('test-<uniq>')`
  или очищай таблицы в `beforeEach`. Для библиотеки упражнений в тестах используй `__setExercisesForTests()`.
- Все строки UI — на русском. Даты в БД — `YYYY-MM-DD` локальные (`today()` из `src/lib/dates`).
- Компоненты страниц — именованные экспорты `XxxPage`. Расчёты — чистые функции в `calc.ts` с тестами.
