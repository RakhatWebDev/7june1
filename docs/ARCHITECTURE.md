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
src/app/Layout.tsx             оболочка + нижняя навигация (5 вкладок) + переходы страниц (motion)
src/index.css                  Tailwind v4 + дизайн-токены (@theme), keyframes, reduced-motion
src/db/types.ts                доменные типы
src/db/index.ts                класс FormaDB (Dexie), экспорт `db`
src/db/seed.ts                 профиль по умолчанию + встроенные программы
src/data/exercises.ts          загрузка библиотеки, useExercises(), URL картинок, словари RU
src/data/programs/             встроенные программы (davidLaidDup.ts)
src/components/ui/index.tsx    примитивы UI (см. «Дизайн-система»)
src/components/ui/helpers.ts   тоны доменов (TONE_*), buttonClasses(), useReduceMotion()
src/components/icons.tsx       <Icon name=… /> — inline-SVG в стиле Lucide (IconName)
src/components/WorkoutsNav.tsx сегменты хаба «Тренировки» (Зал · Кардио · Растяжка · Календарь · История)
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

Тёмная тёплая тема, токены в `src/index.css`: `bg`, `surface`, `surface-2`, `surface-3`, `border`, `text`, `muted`,
`accent` (лайм), `danger`, `warn`, `info`, `violet`, `pink`, `amber`. Цвет по доменам (точечно — иконка, кольцо, прогресс):
зал `accent`, кардио `info`, питание `warn`, сон/разум `violet`, привычки `pink`, книги/финансы `amber`.
Радиусы: карточки `rounded-3xl` (даёт `Card`), контролы `rounded-xl`. Контент `max-w-3xl`, отступ под навигацию уже в `Layout`.
Числа — `tabular-nums`. Эмодзи — только там, где их выбирает пользователь (привычки, категории); иначе `<Icon />`.

Примитивы (`src/components/ui`): `Button` (`variant`, `size`, `icon`, `iconRight`, `loading`), `LinkButton` (router-ссылка
в виде кнопки), `Card` (`variant`: default | elevated | glass | accent, `tone`), `PageHeader` (`eyebrow`, `back`, `action`),
`SectionHeader`, `IconBadge`, `Field`/`Input`/`Select`, `Stepper` (слайд значения), `EmptyState` (`icon`, `tone`, «дышит»),
`Stat` (`icon`, `tone`), `StatTile` (плитка дашборда), `Chip` (`icon`, `tone`, `className`), `SegmentedControl`,
`SegmentedNav` (сегменты-ссылки), `Sheet` (пружина, свайп вниз, Esc, портал), `Progress` (`tone`, анимация ширины),
`Skeleton`, `Ring` (SVG-кольцо 0..1), `CountUp`, `StaggerList` (появление детей с шагом 40 мс), `Confetti`, `Toast`.
Анимации — `motion/react`, 180–320 мс; под `prefers-reduced-motion` всё статично (`useReduceMotion()`); в тестах
`matchMedia` замокан на reduce, поэтому motion-компоненты рендерятся детерминированно.

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
