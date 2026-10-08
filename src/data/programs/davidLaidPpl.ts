import type { ProgramExercise, ProgramExerciseWeek, Program } from '../../db/types'
import {
  DAVID_LAID_PCT_TABLE,
  PROGRAM_WEEKS,
  SESSIONS_PER_WEEK,
  cyc as cyc4,
  davidLaidBlocks,
  singlePlus,
  staticHold,
  straight,
  times,
  twelveWeeks,
} from './build'

/*
 * David Laid — "Push_Pull_Legs_Split" (the user's Word document, see docs/source/david-laid-programs.txt).
 * The document has 6 sessions per week × 4 weeks; laid out as 12 program weeks of 3 sessions with a rotation of
 * 6 sessions (= 2 program weeks): weeks 1–8 = document weeks 1–4 (each twice), week 9 = test week,
 * weeks 10–12 = document weeks 1–3. Main lifts progress 4×10 → 5×8 → 6×5 → 7×3 (% of max from the
 * Program 1 table); variations (pause/Spoto bench, block/deficit/pause deadlift, behind-the-neck press)
 * have no % — weight is picked by feel and auto-regulated from the previous session.
 */

const SQUAT = 'Barbell_Squat'
const BENCH = 'Barbell_Bench_Press_-_Medium_Grip'
const DEADLIFT = 'Barbell_Deadlift'
const CORE_REST = 180

/** Exercise defined by its 4 document weeks, expanded to the 12-week layout. */
const cyc = (
  exerciseId: string,
  name: string,
  doc: ProgramExerciseWeek[],
  opts?: Parameters<typeof cyc4>[3],
): ProgramExercise => cyc4(exerciseId, name, twelveWeeks(doc), opts)

const s = straight
const core = (sets: number, reps: number) => straight(sets, reps, true)

const ACCESSORY_NOTE =
  'Аксессуары на ноги — выбери два: жим ногами 3×20, выпады 3×10, гудморнинги 3×10, разгибания/сгибания ног. ' +
  'По умолчанию стоят жим ногами и выпады (необязательные — замени на свои).'

const legAccessories = (): ProgramExercise[] => [
  cyc('Standing_Calf_Raises', 'Подъёмы на икры', times(s(3, 30)), { restSec: 60 }),
  cyc('Leg_Press', 'Жим ногами (аксессуар на выбор)', times(s(3, 20)), {
    notes: 'Необязательно: один из двух аксессуаров на выбор.',
  }),
  cyc('Dumbbell_Lunges', 'Выпады (аксессуар на выбор)', times(s(3, 10)), {
    notes: 'Необязательно: 10 на каждую ногу. Можно заменить на гудморнинги 3×10 или разгибания/сгибания ног.',
  }),
]

export const davidLaidPpl: Program = {
  id: 'david-laid-ppl',
  name: 'David Laid — Push/Pull/Legs (12 недель, 3×/нед)',
  description:
    '3 тренировки в неделю, 12 недель. По кругу из 6 тренировок: Ноги 1 → Жим 1 → Тяга 1 → Ноги 2 → Жим 2 → Тяга 2. ' +
    'Основные упражнения блоками по 2 недели: 4×10 → 5×8 → 6×5 → 7×3, тяжёлые синглы в первом блоке, ' +
    'статические удержания приседа на 120 %; затем тестовая неделя и повтор первых трёх блоков.',
  source:
    'Документ David Laid «Push_Pull_Legs_Split» (присланный пользователем файл). Процентов в документе нет — ' +
    'для основных упражнений взята таблица из «Программы 1», авторегуляция поправит тренировочный максимум.',
  daysPerWeek: SESSIONS_PER_WEEK,
  sessionsPerWeek: SESSIONS_PER_WEEK,
  schedule: 'sequential',
  weeks: PROGRAM_WEEKS,
  version: 2,
  blocks: davidLaidBlocks(['4×10', '5×8', '6×5', '7×3']),
  cycleNotes:
    'Неделя программы = 3 тренировки. Недели 1–8 = недели документа 1–4 (каждая по 2 недели), неделя 9 — тест ' +
    'новых максимумов (без статических удержаний), недели 10–12 — недели 1–3 документа. 4-я тренировка за ' +
    'календарную неделю просто продолжает круг. Статические удержания — только в силовой раме со страховочными упорами.',
  maxLifts: [
    { exerciseId: SQUAT, label: 'Присед' },
    { exerciseId: BENCH, label: 'Жим лёжа' },
    { exerciseId: DEADLIFT, label: 'Становая тяга' },
    { exerciseId: 'Push_Press', label: 'Жимовой швунг' },
    { exerciseId: 'Standing_Military_Press', label: 'Армейский жим' },
    { exerciseId: 'Front_Barbell_Squat', label: 'Фронтальный присед' },
  ],
  pctTable: DAVID_LAID_PCT_TABLE,
  isBuiltIn: true,
  createdAt: '2026-10-08T00:00:00.000Z',
  days: [
    {
      id: 'ppl-legs-1',
      name: 'Ноги 1',
      type: 'legs',
      notes: ACCESSORY_NOTE,
      exercises: [
        cyc(SQUAT, 'Присед', [singlePlus(4, 10), core(5, 8), core(6, 5), core(7, 3)], {
          restSec: CORE_REST,
        }),
        cyc(SQUAT, 'Статическое удержание приседа (120 %)', times(staticHold()), {
          restSec: CORE_REST,
          maxLiftId: SQUAT,
          notes: 'Сними штангу со стоек и держи наверху 45–60 с. Только в раме со страховкой. В «повторы» — секунды.',
        }),
        ...legAccessories(),
      ],
    },
    {
      id: 'ppl-push-1',
      name: 'Жим 1',
      type: 'push',
      exercises: [
        cyc('Push_Press', 'Жимовой швунг (push press)', [core(3, 5), core(4, 4), core(5, 3), core(6, 2)], {
          restSec: CORE_REST,
        }),
        cyc(BENCH, 'Жим лёжа', [singlePlus(4, 10), core(5, 8), core(6, 5), core(7, 3)], {
          restSec: CORE_REST,
        }),
        cyc('Standing_Barbell_Press_Behind_Neck', 'Жим из-за головы', [s(3, 10), s(4, 8), s(5, 5), s(6, 2)], {
          restSec: 120,
        }),
        cyc('Dips_-_Triceps_Version', 'Брусья с доп. весом', times(s(3, 10))),
        cyc('Side_Lateral_Raise', 'Махи гантелями в стороны', times(s(5, 10)), { restSec: 60 }),
      ],
    },
    {
      id: 'ppl-pull-1',
      name: 'Тяга 1',
      type: 'pull',
      exercises: [
        cyc(DEADLIFT, 'Становая тяга', [singlePlus(4, 8), core(5, 6), core(6, 4), core(7, 2)], {
          restSec: CORE_REST,
        }),
        cyc(DEADLIFT, 'Становая тяга с паузой', times(s(3, 5)), {
          restSec: 150,
          notes: 'Пауза 1–2 с чуть ниже колен.',
        }),
        cyc('Barbell_Shrug', 'Шраги', times(s(3, 10))),
        cyc('Bent_Over_Barbell_Row', 'Тяга Пендли', times(s(3, 10)), {
          restSec: 120,
          notes: 'Каждое повторение — с пола, корпус параллельно полу.',
        }),
        cyc('Pullups', 'Подтягивания', times(s(3, '10-15')), { restSec: 120 }),
      ],
    },
    {
      id: 'ppl-legs-2',
      name: 'Ноги 2',
      type: 'legs',
      notes: ACCESSORY_NOTE,
      exercises: [
        cyc(SQUAT, 'Присед с паузой', [singlePlus(2, 6), core(3, 4), core(4, 3), core(5, 2)], {
          restSec: CORE_REST,
          maxLiftId: SQUAT,
          notes: 'Пауза 1–2 с внизу. Проценты — от максимума в приседе.',
        }),
        cyc('Front_Barbell_Squat', 'Фронтальный присед', [core(4, 10), core(5, 8), core(6, 5), core(7, 3)], {
          restSec: CORE_REST,
        }),
        ...legAccessories(),
      ],
    },
    {
      id: 'ppl-push-2',
      name: 'Жим 2',
      type: 'push',
      exercises: [
        cyc(BENCH, 'Жим лёжа с паузой', [s(2, 6), s(3, 4), s(4, 3), s(5, 2)], {
          restSec: CORE_REST,
          notes: 'Пауза 1–2 с на груди. На 4-й неделе в документе стоит «ATG Squat 5×2» — вероятно, опечатка.',
        }),
        cyc(BENCH, 'Spoto-жим (пауза над грудью)', [s(4, 10), s(5, 8), s(6, 5), s(7, 3)], {
          restSec: 150,
          notes: 'Остановка штанги в 2–3 см над грудью без касания.',
        }),
        cyc('Standing_Military_Press', 'Армейский жим стоя', [core(4, 10), core(5, 8), core(6, 5), core(7, 3)], {
          restSec: CORE_REST,
        }),
        cyc('Dips_-_Triceps_Version', 'Брусья с доп. весом', times(s(3, 10))),
        cyc('Side_Lateral_Raise', 'Махи гантелями в стороны', [s(3, 10), s(5, 10), s(5, 10), s(5, 10)], {
          restSec: 60,
        }),
      ],
    },
    {
      id: 'ppl-pull-2',
      name: 'Тяга 2',
      type: 'pull',
      exercises: [
        cyc('Rack_Pulls', 'Тяга с блоков', [s(2, 6), s(3, 4), s(4, 3), s(5, 2)], {
          restSec: CORE_REST,
          notes: 'Блоки/плинты под блинами — гриф чуть ниже колен.',
        }),
        cyc('Deficit_Deadlift', 'Тяга с дефицитом', [s(4, 10), s(5, 8), s(6, 10), s(7, 3)], {
          restSec: 150,
          notes: 'Стоя на блине 2–5 см. На 3-й неделе в документе 6×10 (по логике схемы, вероятно, 6×5).',
        }),
        cyc('Barbell_Shrug', 'Шраги', times(s(3, 10))),
        cyc('Bent_Over_Barbell_Row', 'Тяга штанги в наклоне', times(s(3, 10)), { restSec: 120 }),
        cyc('Pullups', 'Подтягивания', times(s(3, '10-15')), { restSec: 120 }),
      ],
    },
  ],
}
