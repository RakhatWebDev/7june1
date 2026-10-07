import { describe, expect, it } from 'vitest'
import type { Habit, JournalEntry, MindSession, MoodEntry, WorkoutSession } from '../../db/types'
import {
  averageMood,
  cleanItems,
  daySummary,
  defaultSlot,
  gratitudeStreak,
  insightText,
  journalPreview,
  lastNDates,
  moodSeries,
  parseTags,
  practiceMinutes,
  searchJournal,
  tagInsights,
} from './calc'

const REF = '2026-10-07'
let seq = 0

function mood(date: string, value: MoodEntry['mood'], tags: string[] = [], extra: Partial<MoodEntry> = {}): MoodEntry {
  seq++
  return { id: `m${seq}`, date, slot: 'morning', mood: value, tags, createdAt: `${date}T08:00:00.000Z`, ...extra }
}

function journal(date: string, kind: JournalEntry['kind'], extra: Partial<JournalEntry> = {}): JournalEntry {
  seq++
  return { id: `j${seq}`, date, kind, createdAt: `${date}T20:00:${String(seq % 60).padStart(2, '0')}.000Z`, ...extra }
}

describe('tagInsights', () => {
  it('compares the average mood with and without each tag over 30 days', () => {
    const moods = [
      mood('2026-10-07', 5, ['зал']),
      mood('2026-10-06', 4, ['зал', 'работа']),
      mood('2026-10-05', 4, ['Зал ']), // normalised to "зал"
      mood('2026-10-04', 3, ['работа']),
      mood('2026-10-03', 3, []),
      mood('2026-10-02', 4, ['работа']),
      // Outside the 30-day window — ignored
      mood('2026-09-07', 1, ['зал']),
    ]
    const res = tagInsights(moods, REF)
    const gym = res.find((i) => i.tag === 'зал')!
    expect(gym).toMatchObject({ withCount: 3, withoutCount: 3, withAvg: 4.3, withoutAvg: 3.3, delta: 1 })
    const work = res.find((i) => i.tag === 'работа')!
    // with: 4, 3, 4 → 3.67; without: 5, 4, 3 → 4
    expect(work).toMatchObject({ withCount: 3, withAvg: 3.7, withoutAvg: 4, delta: -0.3 })
    // Strongest effect first
    expect(res.map((i) => i.tag)).toEqual(['зал', 'работа'])
    expect(insightText(gym)).toBe('С тегом «зал» настроение в среднем 4.3, без — 3.3')
  })

  it('skips tags seen fewer than minCount times or present in every check-in', () => {
    const moods = [mood('2026-10-07', 5, ['семья', 'сон']), mood('2026-10-06', 2, ['сон'])]
    expect(tagInsights(moods, REF)).toEqual([])
    expect(tagInsights(moods, REF, 30, 1).map((i) => i.tag)).toEqual(['семья'])
  })

  it('returns nothing without data', () => {
    expect(tagInsights([], REF)).toEqual([])
  })
})

describe('gratitudeStreak', () => {
  it('counts consecutive days ending today', () => {
    const entries = [
      journal('2026-10-07', 'gratitude', { items: ['кофе'] }),
      journal('2026-10-06', 'gratitude', { items: ['друзья', ''] }),
      journal('2026-10-05', 'gratitude', { items: ['семья'] }),
      journal('2026-10-03', 'gratitude', { items: ['солнце'] }),
    ]
    expect(gratitudeStreak(entries, REF)).toBe(3)
  })

  it('does not break the streak while today is still empty', () => {
    const entries = [journal('2026-10-06', 'gratitude', { items: ['a'] }), journal('2026-10-05', 'gratitude', { items: ['b'] })]
    expect(gratitudeStreak(entries, REF)).toBe(2)
  })

  it('is zero after a missed day and ignores empty or non-gratitude entries', () => {
    const entries = [
      journal('2026-10-05', 'gratitude', { items: ['a'] }),
      journal('2026-10-07', 'gratitude', { items: ['  ', ''] }),
      journal('2026-10-06', 'free', { text: 'спасибо' }),
    ]
    expect(gratitudeStreak(entries, REF)).toBe(0)
    expect(gratitudeStreak([], REF)).toBe(0)
  })

  it('handles month boundaries and several entries per day', () => {
    const entries = [
      journal('2026-10-01', 'gratitude', { items: ['a'] }),
      journal('2026-10-01', 'gratitude', { items: ['b'] }),
      journal('2026-09-30', 'gratitude', { items: ['c'] }),
      journal('2026-09-29', 'gratitude', { items: ['d'] }),
    ]
    expect(gratitudeStreak(entries, '2026-10-01')).toBe(3)
  })
})

describe('moodSeries', () => {
  it('returns one point per day for 30 days, averaging multiple check-ins', () => {
    const moods = [
      mood('2026-10-07', 4, [], { energy: 3 }),
      mood('2026-10-07', 5, [], { slot: 'evening', energy: 4 }),
      mood('2026-09-08', 2),
      mood('2026-09-07', 1), // 31st day back — out of range
    ]
    const s = moodSeries(moods, REF, 30)
    expect(s).toHaveLength(30)
    expect(s[0]).toMatchObject({ date: '2026-09-08', label: '08.09', mood: 2, energy: null })
    expect(s[29]).toMatchObject({ date: '2026-10-07', label: '07.10', mood: 4.5, energy: 3.5 })
    expect(s.filter((p) => p.mood != null)).toHaveLength(2)
  })

  it('lists consecutive dates oldest first', () => {
    expect(lastNDates('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02'])
  })

  it('averages mood over the window', () => {
    expect(averageMood([mood('2026-10-07', 5), mood('2026-10-01', 2), mood('2026-01-01', 1)], REF)).toBe(3.5)
    expect(averageMood([], REF)).toBeNull()
  })
})

describe('practiceMinutes', () => {
  const s = (date: string, durationMin: number): MindSession => ({
    id: `${date}-${durationMin}`,
    date,
    kind: 'meditation',
    durationMin,
    createdAt: `${date}T10:00:00Z`,
  })
  it('sums minutes within the inclusive date range', () => {
    const sessions = [s('2026-10-05', 10), s('2026-10-07', 5), s('2026-10-07', 3), s('2026-10-12', 20)]
    expect(practiceMinutes(sessions, '2026-10-07')).toBe(8)
    expect(practiceMinutes(sessions, '2026-10-05', '2026-10-11')).toBe(18)
  })
})

describe('journal helpers', () => {
  const entries = [
    journal('2026-10-05', 'gratitude', { items: ['Тёплый чай', 'прогулка'] }),
    journal('2026-10-07', 'free', { text: 'Сегодня думал о Работе', tags: ['идеи'] }),
    journal('2026-10-06', 'evening_review', { items: ['закрыл задачу', '', 'спорт'] }),
  ]

  it('filters by kind and searches text, items and tags case-insensitively, newest first', () => {
    expect(searchJournal(entries, '').map((e) => e.date)).toEqual(['2026-10-07', '2026-10-06', '2026-10-05'])
    expect(searchJournal(entries, 'работ').map((e) => e.kind)).toEqual(['free'])
    expect(searchJournal(entries, 'ЧАЙ').map((e) => e.kind)).toEqual(['gratitude'])
    expect(searchJournal(entries, 'идеи').map((e) => e.kind)).toEqual(['free'])
    expect(searchJournal(entries, '', 'evening_review')).toHaveLength(1)
    expect(searchJournal(entries, 'чай', 'free')).toHaveLength(0)
  })

  it('builds previews', () => {
    expect(journalPreview(entries[0])).toBe('Тёплый чай · прогулка')
    expect(journalPreview(entries[2])).toBe('Что получилось: закрыл задачу · Главное на завтра: спорт')
    expect(journalPreview(journal(REF, 'free', { text: 'a'.repeat(200) }), 10)).toBe(`${'a'.repeat(9)}…`)
  })

  it('cleans items and parses tags', () => {
    expect(cleanItems([' a ', '', '  ', 'b'])).toEqual(['a', 'b'])
    expect(parseTags('Работа,  идеи ,,работа')).toEqual(['работа', 'идеи'])
  })
})

describe('daySummary', () => {
  it('collects workout, cardio, kcal, water and habits for the day', () => {
    const local = (h: number) => new Date(2026, 9, 7, h, 0).toISOString()
    const sessions = [{ id: 's1', name: 'Push', startedAt: local(18), exercises: [] } as WorkoutSession]
    const habit = (id: string, archived = false): Habit => ({
      id,
      name: id,
      icon: '•',
      color: 'accent',
      frequency: 'daily',
      autoRule: null,
      sort: 0,
      archived,
      createdAt: '',
    })
    const res = daySummary(
      {
        sessions,
        activities: [
          { id: 'a1', type: 'run', date: REF, durationMin: 25 },
          { id: 'a2', type: 'walk', date: '2026-10-06', durationMin: 60 },
        ],
        foodEntries: [
          { id: 'f1', date: REF, meal: 'lunch', name: 'x', grams: 100, kcal: 650.4, proteinG: 0, carbsG: 0, fatG: 0, createdAt: '' },
          { id: 'f2', date: REF, meal: 'dinner', name: 'y', grams: 100, kcal: 800.3, proteinG: 0, carbsG: 0, fatG: 0, createdAt: '' },
        ],
        water: [
          { id: 'w1', date: REF, ml: 500, createdAt: '' },
          { id: 'w2', date: REF, ml: 750, createdAt: '' },
        ],
        habits: [habit('h1'), habit('h2'), habit('h3'), habit('old', true)],
        habitLogs: [
          { id: 'l1', habitId: 'h1', date: REF, done: true },
          { id: 'l2', habitId: 'h2', date: REF, done: false },
          { id: 'l3', habitId: 'h3', date: '2026-10-06', done: true },
          { id: 'l4', habitId: 'old', date: REF, done: true },
        ],
      },
      REF,
    )
    expect(res).toEqual({ workout: true, cardioMin: 25, kcal: 1451, waterMl: 1250, habitsDone: 1, habitsTotal: 3 })
  })

  it('reports an empty day', () => {
    const empty = { sessions: [], activities: [], foodEntries: [], water: [], habits: [], habitLogs: [] }
    expect(daySummary(empty, REF)).toEqual({ workout: false, cardioMin: 0, kcal: 0, waterMl: 0, habitsDone: 0, habitsTotal: 0 })
  })
})

describe('defaultSlot', () => {
  it('is morning before 15:00 and evening afterwards', () => {
    expect(defaultSlot(new Date(2026, 9, 7, 9))).toBe('morning')
    expect(defaultSlot(new Date(2026, 9, 7, 14, 59))).toBe('morning')
    expect(defaultSlot(new Date(2026, 9, 7, 15))).toBe('evening')
  })
})
