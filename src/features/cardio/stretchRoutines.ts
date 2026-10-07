/**
 * Built-in stretching routines. Every `exerciseId` must reference an exercise from
 * public/data/exercises.json with `category === 'stretching'` (verified by stretchRoutines.test.ts).
 */

export const DEFAULT_HOLD_SEC = 30

export interface StretchStep {
  exerciseId: string
  /** Russian display name (library names are English) */
  nameRu: string
  /** Hold time per side, seconds */
  holdSec: number
  /** Unilateral stretch: timer runs twice (left, then right) */
  perSide: boolean
}

export interface StretchRoutine {
  id: string
  name: string
  description: string
  steps: StretchStep[]
}

const step = (exerciseId: string, nameRu: string, perSide: boolean, holdSec = DEFAULT_HOLD_SEC): StretchStep => ({
  exerciseId,
  nameRu,
  holdSec,
  perSide,
})

export const stretchRoutines: StretchRoutine[] = [
  {
    id: 'after-legs',
    name: 'После ног',
    description: 'Квадрицепс, бицепс бедра, икры, ягодицы, поясница',
    steps: [
      step('On_Your_Side_Quad_Stretch', 'Квадрицепс лёжа на боку', true),
      step('Kneeling_Hip_Flexor', 'Сгибатели бедра в выпаде на колене', true),
      step('Hamstring_Stretch', 'Бицепс бедра лёжа с ремнём', true),
      step('Seated_Floor_Hamstring_Stretch', 'Наклон к прямой ноге сидя', true),
      step('Calf_Stretch_Hands_Against_Wall', 'Икры у стены', true),
      step('Ankle_On_The_Knee', 'Ягодичные: лодыжка на колено', true),
      step('Knee_Across_The_Body', 'Скрутка лёжа, колено через корпус', true),
      step('Childs_Pose', 'Поза ребёнка', false, 45),
      step('Hug_Knees_To_Chest', 'Колени к груди', false),
    ],
  },
  {
    id: 'after-upper',
    name: 'После верха',
    description: 'Грудь, плечи, широчайшие, трицепс, шея',
    steps: [
      step('Dynamic_Chest_Stretch', 'Динамическое раскрытие груди', false),
      step('Elbows_Back', 'Локти назад', false),
      step('Shoulder_Stretch', 'Плечо поперёк корпуса', true),
      step('Upward_Stretch', 'Вытяжение вверх', false),
      step('One_Arm_Against_Wall', 'Широчайшие у стены', true),
      step('Side-Lying_Floor_Stretch', 'Боковое вытяжение лёжа', true),
      step('Triceps_Stretch', 'Трицепс за головой', true),
      step('Tricep_Side_Stretch', 'Трицепс через плечо', true),
      step('Side_Neck_Stretch', 'Наклон головы к плечу', true),
    ],
  },
  {
    id: 'morning-mobility',
    name: 'Утренняя мобилити',
    description: 'Всё тело, около 10 минут',
    steps: [
      step('Cat_Stretch', 'Кошка', false, 60),
      step('Worlds_Greatest_Stretch', '«Лучшая растяжка в мире»', true, 45),
      step('Inchworm', 'Гусеница', false, 60),
      step('Standing_Hip_Circles', 'Круги бедром стоя', true),
      step('Arm_Circles', 'Круги руками', false, 45),
      step('Standing_Lateral_Stretch', 'Боковой наклон стоя', true),
      step('Kneeling_Hip_Flexor', 'Сгибатели бедра в выпаде на колене', true, 45),
      step('Ankle_Circles', 'Круги стопой', true),
      step('Middle_Back_Stretch', 'Скручивания стоя', true),
    ],
  },
]

export function getRoutine(id: string | undefined): StretchRoutine | undefined {
  return stretchRoutines.find((r) => r.id === id)
}

export function stepDurationSec(s: StretchStep): number {
  return s.holdSec * (s.perSide ? 2 : 1)
}

export function routineDurationSec(r: StretchRoutine): number {
  return r.steps.reduce((sum, s) => sum + stepDurationSec(s), 0)
}
