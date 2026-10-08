import type { Program } from '../../../db/types'
import { davidLaidDup } from '../../../data/programs/davidLaidDup'

/**
 * A custom program with fixed weekdays (Mon–Sat + Sunday rest) and no weekly cycle — the built-ins are all
 * 12-week rotations now, but user/coach-made programs can still be scheduled by weekday.
 */
export const weekdayProgram: Program = {
  id: 'custom-weekday',
  name: 'Моя программа по дням недели',
  description: 'PPL ×2 по дням недели',
  daysPerWeek: 6,
  schedule: 'weekday',
  isBuiltIn: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  days: [
    ...davidLaidDup.days.map((d, i) => ({
      ...d,
      weekday: i,
      exercises: d.exercises.map((e) => ({ ...e, weekly: undefined })),
    })),
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
