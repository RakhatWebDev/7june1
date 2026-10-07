import type { Program, ProgramExercise } from '../../db/types'

const ex = (
  exerciseId: string,
  name: string,
  sets: number,
  reps: string,
  restSec = 120,
  intensity?: string,
  notes?: string,
): ProgramExercise => ({ exerciseId, name, sets, reps, restSec, intensity, notes })

/**
 * David Laid — DUP (Daily Undulating Periodization) 6-day Push/Pull/Legs.
 *
 * This is a community reconstruction (Routines Club / Lift Vault / fan spreadsheets),
 * not the paid official program. Day 1–3 are heavy (3–6 reps, ~85%+ 1RM on the main lift),
 * day 4–6 repeat the split with moderate hypertrophy work (8–15 reps).
 */
export const davidLaidDup: Program = {
  id: 'david-laid-dup',
  name: 'David Laid — DUP 6 дней (PPL ×2)',
  description:
    'Push/Pull/Legs дважды в неделю. Первая половина недели — тяжёлая сила (3–6 повторов), ' +
    'вторая — умеренный объём на гипертрофию (8–15). Присед и тяга 2 раза в неделю, жим — 1–2. ' +
    'Прогрессия: добавляй вес на тяжёлых днях, когда все рабочие подходы выполнены с запасом 1–2 повтора.',
  source:
    'Реконструкция по открытым источникам: Routines Club, Lift Vault, Gymshark blog, фан-таблицы. ' +
    'Официальная программа продаётся на сайте David Laid. Объём высокий — при нехватке восстановления ' +
    'убирай по одному вспомогательному упражнению в день.',
  daysPerWeek: 6,
  isBuiltIn: true,
  createdAt: '2026-10-07T00:00:00.000Z',
  days: [
    {
      id: 'legs-1',
      name: 'Ноги 1 — сила',
      type: 'legs',
      weekday: 0,
      exercises: [
        ex('Barbell_Squat', 'Присед со штангой (тяжёлый)', 5, '3-5', 180, '85-90% 1RM'),
        ex('Barbell_Squat', 'Присед со штангой (объём)', 4, '6-8', 150, '70-75% 1RM'),
        ex('Romanian_Deadlift', 'Румынская тяга', 3, '8-10', 120),
        ex('Barbell_Lunge', 'Выпады со штангой', 3, '10', 90, undefined, 'На каждую ногу'),
        ex('Glute_Ham_Raise', 'Glute-ham raise / сгибание ног', 3, '10-12', 90),
        ex('Rocking_Standing_Calf_Raise', 'Подъём на носки стоя', 4, '12-15', 60),
      ],
    },
    {
      id: 'push-1',
      name: 'Жим 1 — сила',
      type: 'push',
      weekday: 1,
      exercises: [
        ex('Barbell_Bench_Press_-_Medium_Grip', 'Жим лёжа', 4, '4', 180, '85% 1RM'),
        ex('Push_Press', 'Швунг жимовой', 3, '4', 150),
        ex('Dips_-_Triceps_Version', 'Отжимания на брусьях с весом', 3, '10', 120),
        ex('Dumbbell_Flyes', 'Разводка гантелей / пек-дек', 3, '10', 90),
        ex('Side_Lateral_Raise', 'Махи гантелями в стороны', 3, '10', 60),
        ex('EZ-Bar_Skullcrusher', 'Французский жим (skull crusher)', 3, '10', 90),
        ex('Dumbbell_One-Arm_Triceps_Extension', 'Разгибание с гантелью над головой', 3, '10', 60),
      ],
    },
    {
      id: 'pull-1',
      name: 'Тяга 1 — сила',
      type: 'pull',
      weekday: 2,
      exercises: [
        ex('Barbell_Deadlift', 'Становая тяга (тяжёлая)', 5, '3-5', 180, '85-90% 1RM'),
        ex('Barbell_Deadlift', 'Становая тяга (объём)', 4, '4-6', 150, '75% 1RM'),
        ex('Stiff-Legged_Barbell_Deadlift', 'Тяга на прямых ногах', 3, '8-10', 120),
        ex('Weighted_Pull_Ups', 'Подтягивания с весом', 3, '6-10', 120),
        ex('Bent_Over_Barbell_Row', 'Тяга штанги в наклоне (Yates row)', 3, '8-10', 120),
        ex('Barbell_Shrug', 'Шраги со штангой', 3, '10-12', 60),
        ex('Barbell_Curl', 'Сгибание рук со штангой', 3, '8-10', 60),
        ex('Hammer_Curls', 'Молотки сидя', 3, '10-12', 60),
      ],
    },
    {
      id: 'legs-2',
      name: 'Ноги 2 — гипертрофия',
      type: 'legs',
      weekday: 3,
      exercises: [
        ex('Barbell_Squat', 'Присед со штангой', 4, '10-12', 120, '65-70% 1RM'),
        ex('Leg_Press', 'Жим ногами', 4, '12-15', 90),
        ex('Romanian_Deadlift', 'Румынская тяга', 3, '10-12', 120),
        ex('Leg_Extensions', 'Разгибание ног', 4, '12-15', 60),
        ex('Lying_Leg_Curls', 'Сгибание ног лёжа', 4, '10-12', 60),
        ex('Dumbbell_Lunges', 'Шагающие выпады', 3, '12', 90, undefined, 'На каждую ногу'),
        ex('Seated_Calf_Raise', 'Подъём на носки сидя', 4, '15-20', 45),
      ],
    },
    {
      id: 'push-2',
      name: 'Жим 2 — гипертрофия',
      type: 'push',
      weekday: 4,
      exercises: [
        ex('Standing_Military_Press', 'Армейский жим стоя', 4, '12', 120),
        ex('Barbell_Incline_Bench_Press_-_Medium_Grip', 'Жим на наклонной', 3, '12', 120),
        ex('Side_Lateral_Raise', 'Махи гантелями в стороны', 3, '10-15', 60),
        ex('Dips_-_Triceps_Version', 'Отжимания на брусьях', 3, '10', 90),
        ex('Dumbbell_One-Arm_Triceps_Extension', 'Разгибание с гантелью над головой', 3, '10', 60),
        ex('EZ-Bar_Skullcrusher', 'Французский жим', 3, '10', 60),
      ],
    },
    {
      id: 'pull-2',
      name: 'Тяга 2 — гипертрофия',
      type: 'pull',
      weekday: 5,
      exercises: [
        ex('Barbell_Deadlift', 'Становая тяга (техника)', 4, '2', 180, '80% 1RM', 'Чисто и быстро'),
        ex('Stiff-Legged_Barbell_Deadlift', 'Тяга на прямых ногах', 3, '10', 120),
        ex('Pullups', 'Подтягивания', 3, '8-10', 120),
        ex('Bent_Over_Barbell_Row', 'Тяга штанги в наклоне', 3, '10', 120),
        ex('Barbell_Shrug', 'Шраги', 3, '10', 60),
        ex('Barbell_Curl', 'Сгибание рук со штангой', 3, '10', 60),
        ex('Hammer_Curls', 'Молотки', 3, '10', 60),
      ],
    },
    {
      id: 'rest',
      name: 'Отдых / лёгкое кардио',
      type: 'rest',
      weekday: 6,
      exercises: [],
      notes: 'Прогулка 30–60 мин, бассейн или растяжка. Без тяжёлой нагрузки.',
    },
  ],
}
