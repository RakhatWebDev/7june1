import type { Program } from '../../db/types'
import { DAVID_LAID_PCT_TABLE, cyc, heavySingle, maxTest, pyramid, skip, straight, times, toFailure } from './build'

/*
 * David Laid — "Workout_Program_1" (the user's Word document, see docs/source/david-laid-programs.txt).
 * 4-week cycle, 5 days rotating in order (Legs → Push 1 → Pull 1 → Push 2 → Pull 2).
 * Russian names follow the user's personalised copy ("David_Laid.docx") where it is correct.
 */

const SQUAT = 'Barbell_Squat'
const BENCH = 'Barbell_Bench_Press_-_Medium_Grip'
const DEADLIFT = 'Barbell_Deadlift'
const CORE_REST = 180
const MAX_REST = 240

const p = pyramid
const core = (reps: number[]) => pyramid(reps, true)
const x3x10 = () => times(straight(3, 10))

const CALF_NOTE =
  'Последние 10 повторений каждого подхода — пауза в верхней точке 2–3 с, последнее повторение — 5–10 с. ' +
  'Держи икры в напряжении весь подход.'

export const davidLaidProgram1: Program = {
  id: 'david-laid-program-1',
  name: 'David Laid — Программа 1 (4 недели)',
  description:
    '5 тренировок по кругу: Ноги → Жим 1 → Тяга 1 → Жим 2 → Тяга 2. Цикл 4 недели: схемы 10-8-6, 4-4-2, 5-3-1 ' +
    'и неделя максимумов (MAX). Веса базовых упражнений — % от твоего максимума, аксессуары — по самочувствию.',
  source:
    'Документ David Laid «Workout_Program_1» (личная переписка, присланный пользователем файл). ' +
    'Проценты точнее всего для приседа — для становой и особенно жима лёжа вес может понадобиться увеличить.',
  daysPerWeek: 5,
  schedule: 'sequential',
  weeks: 4,
  cycleNotes:
    'Программу проходят дважды: 2 цикла по 4 недели, а между ними — неделя на проверку новых максимумов. ' +
    'Для аксессуаров бери комфортный вес, для базовых упражнений — % от максимума по таблице.',
  maxLifts: [
    { exerciseId: SQUAT, label: 'Присед' },
    { exerciseId: BENCH, label: 'Жим лёжа' },
    { exerciseId: DEADLIFT, label: 'Становая тяга' },
    { exerciseId: 'Push_Press', label: 'Жимовой швунг' },
    { exerciseId: 'Close-Grip_Barbell_Bench_Press', label: 'Жим узким хватом' },
    { exerciseId: 'Standing_Military_Press', label: 'Армейский жим' },
    { exerciseId: 'Sumo_Deadlift', label: 'Тяга сумо' },
    { exerciseId: 'Front_Barbell_Squat', label: 'Фронтальный присед' },
  ],
  pctTable: DAVID_LAID_PCT_TABLE,
  isBuiltIn: true,
  createdAt: '2026-10-08T00:00:00.000Z',
  days: [
    {
      id: 'p1-legs',
      name: 'Ноги',
      type: 'legs',
      notes:
        'Подъёмы на икры: последние 10 повторений с паузой 2–3 с наверху, последнее — 5–10 с. ' +
        'На неделе MAX в приседе, как и в становой, шаг до 10 кг между синглами нормален, когда вес выше 80 % прошлого максимума.',
      exercises: [
        cyc(SQUAT, 'Присед', [core([10, 8, 6]), core([4, 4, 2]), core([5, 3, 1]), maxTest()], {
          restSec: CORE_REST,
        }),
        cyc('Leg_Press', 'Жим ногами', x3x10()),
        cyc('Leg_Extensions', 'Разгибания ног', x3x10()),
        cyc('Lying_Leg_Curls', 'Сгибания ног', x3x10()),
        cyc('Smith_Machine_Calf_Raise', 'Подъёмы на икры в Смите', times(p([40, 30, 20])), {
          restSec: 60,
          notes: CALF_NOTE,
        }),
        cyc('Seated_Calf_Raise', 'Подъёмы на икры сидя', times(p([30, 20, 10])), {
          restSec: 60,
          notes: CALF_NOTE,
        }),
        cyc('Bodyweight_Squat', 'Стенка (удержание у стены)', times(toFailure(2)), {
          restSec: 120,
          notes: 'Удержание у стены до отказа, отдых 2 мин. В «повторы» записывай секунды.',
        }),
      ],
    },
    {
      id: 'p1-push-1',
      name: 'Жим 1',
      type: 'push',
      notes:
        'Жимовой швунг: подсед — четверть приседа, взрывной. В дни жимов можно добавить всю работу на бицепс и трицепс.',
      exercises: [
        cyc(
          'Push_Press',
          'Жимовой швунг (push press)',
          [maxTest(), core([10, 8, 6]), core([4, 4, 2]), core([5, 3, 1])],
          {
            restSec: CORE_REST,
            notes: 'Подсед на ¼ приседа — взрывной.',
          },
        ),
        cyc(
          'Close-Grip_Barbell_Bench_Press',
          'Жим лёжа узким хватом',
          [maxTest(), core([10, 8, 6]), core([4, 4, 2]), core([5, 3, 1])],
          {
            restSec: CORE_REST,
            notes: 'Прогиб в спине, локти прижаты на опускании — разведённые локти перегружают плечо.',
          },
        ),
        cyc('Clean_and_Press', 'Взятие на грудь и жим (руки поочерёдно)', times(p([10, 8, 6])), {
          restSec: 120,
          notes: 'Чередуй руки в каждом повторении.',
        }),
        cyc('Dips_-_Triceps_Version', 'Брусья с доп. весом', x3x10()),
        cyc('Seated_Dumbbell_Press', 'Жим гантелей сидя', x3x10()),
        cyc('Pushups', 'Отжимания', times(toFailure(2)), {
          restSec: 120,
          notes: 'До отказа, отдых 2 мин.',
        }),
      ],
    },
    {
      id: 'p1-pull-1',
      name: 'Тяга 1',
      type: 'pull',
      exercises: [
        cyc(DEADLIFT, 'Становая тяга', [core([5, 3, 1]), maxTest(), core([10, 8, 6]), core([4, 4, 2])], {
          restSec: CORE_REST,
        }),
        cyc(SQUAT, 'Присед с паузой', [core([5, 3, 1]), maxTest(), core([6, 5, 4]), core([4, 4, 2])], {
          restSec: CORE_REST,
          maxLiftId: SQUAT,
          notes: 'Пауза 1–2 с в нижней точке. Проценты — от максимума в приседе.',
        }),
        cyc('Dumbbell_Shrug', 'Шраги с гантелями', [p([10, 8, 6]), p([12, 10, 8]), p([6, 5, 4]), p([4, 4, 2])]),
        cyc('Bent_Over_Barbell_Row', 'Тяга штанги в наклоне', times(p([10, 8, 6])), {
          restSec: 120,
        }),
        cyc('T-Bar_Row_with_Handle', 'Т-тяга', x3x10()),
        cyc('Pullups', 'Подтягивания', times(toFailure(2)), { restSec: 120, notes: 'До отказа.' }),
      ],
    },
    {
      id: 'p1-push-2',
      name: 'Жим 2',
      type: 'push',
      notes: 'Прогиб в жиме лёжа и прижатые локти на опускании.',
      exercises: [
        cyc('Barbell_Full_Squat', 'Глубокий присед (ATG)', times(heavySingle()), {
          restSec: MAX_REST,
          maxLiftId: SQUAT,
          notes: 'Присед «до упора» (ass-to-grass). Проценты — от максимума в приседе.',
        }),
        cyc(BENCH, 'Жим лёжа', [maxTest(), core([10, 8, 6]), core([4, 4, 2]), core([5, 3, 1])], {
          restSec: CORE_REST,
        }),
        cyc(
          'Standing_Military_Press',
          'Армейский жим стоя',
          [maxTest(), core([10, 8, 6]), core([4, 4, 2]), core([5, 3, 1])],
          {
            restSec: CORE_REST,
          },
        ),
        cyc('Incline_Dumbbell_Press', 'Жим гантелей на наклонной', x3x10()),
        cyc('Side_Lateral_Raise', 'Махи гантелями в стороны стоя', x3x10(), { restSec: 60 }),
      ],
    },
    {
      id: 'p1-pull-2',
      name: 'Тяга 2',
      type: 'pull',
      notes: 'Тяга сумо: носки развёрнуты на 45°, стойка настолько широкая, насколько удобно.',
      exercises: [
        cyc('Sumo_Deadlift', 'Становая тяга сумо', [core([4, 4, 2]), core([5, 3, 1]), maxTest(), core([10, 8, 6])], {
          restSec: CORE_REST,
          notes: 'Носки на 45°, широкая удобная стойка.',
        }),
        cyc('Front_Barbell_Squat', 'Фронтальный присед', [core([4, 4, 2]), core([5, 3, 1]), maxTest(), skip()], {
          restSec: CORE_REST,
        }),
        cyc('Dumbbell_Shrug', 'Шраги с гантелями', [p([4, 4, 2]), p([10, 8, 6]), p([10, 8, 6]), p([10, 8, 6])]),
        cyc(
          'Bent_Over_Barbell_Row',
          'Тяга штанги в наклоне',
          [p([10, 8, 6]), p([10, 8, 6]), straight(3, 10), straight(3, 10)],
          {
            restSec: 120,
          },
        ),
        cyc('T-Bar_Row_with_Handle', 'Т-тяга', x3x10()),
        cyc('Pullups', 'Подтягивания', times(toFailure(2)), { restSec: 120, notes: 'До отказа.' }),
      ],
    },
  ],
}
