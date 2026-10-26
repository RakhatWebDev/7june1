import { describe, expect, it } from 'vitest'
import { restOverPhrase, sayKg, sayRest, tapPhrase } from '../cues'

describe('sayKg', () => {
  it.each([
    [80, 'восемьдесят'],
    [82.5, 'восемьдесят два с половиной'],
    [102.25, 'сто два с четвертью'],
    [117.75, 'сто семнадцать и три четверти'],
    [20, 'двадцать'],
    [1, 'один'],
    [2.5, 'два с половиной'],
    [0.5, 'половина'],
    [215, 'двести пятнадцать'],
    [111, 'сто одиннадцать'],
    [300, 'триста'],
  ])('%s → %s', (kg, words) => {
    expect(sayKg(kg)).toBe(words)
  })

  it('rounds odd fractions to the nearest quarter', () => {
    expect(sayKg(82.4)).toBe('восемьдесят два с половиной')
    expect(sayKg(82.1)).toBe('восемьдесят два')
  })
})

describe('sayRest', () => {
  it.each([
    [60, 'одна минута'],
    [90, 'полторы минуты'],
    [120, 'две минуты'],
    [150, 'две с половиной минуты'],
    [180, 'три минуты'],
    [300, 'пять минут'],
    [45, 'сорок пять секунд'],
    [21, 'двадцать одна секунда'],
    [32, 'тридцать две секунды'],
    [135, 'две минуты пятнадцать секунд'],
  ])('%s s → %s', (sec, words) => {
    expect(sayRest(sec)).toBe(words)
  })
})

describe('tapPhrase', () => {
  const next = { setNo: 3, weightKg: 82.5, reps: '6', last: null }

  it('says the rest and the next set of the same exercise', () => {
    expect(tapPhrase({ restSec: 120, next })).toBe(
      'Отдых две минуты. Дальше: подход три, восемьдесят два с половиной на шесть.',
    )
  })

  it('adds last time when there is history', () => {
    expect(tapPhrase({ restSec: 120, next: { ...next, last: { weightKg: 80, reps: 6 } } })).toBe(
      'Отдых две минуты. Дальше: подход три, восемьдесят два с половиной на шесть. В прошлый раз восемьдесят на шесть.',
    )
  })

  it('names the exercise when the next set starts another one', () => {
    expect(
      tapPhrase({
        restSec: 90,
        next: {
          exerciseName: 'Тяга верхнего блока',
          setNo: 1,
          weightKg: 55,
          reps: '8-12',
          last: null,
        },
      }),
    ).toBe(
      'Отдых полторы минуты. Дальше: Тяга верхнего блока, подход один, пятьдесят пять на восемь – двенадцать.',
    )
  })

  it('bodyweight sets say reps with the noun, and last time without weight', () => {
    expect(
      tapPhrase({
        restSec: 60,
        next: { setNo: 2, weightKg: null, reps: '12', last: { weightKg: null, reps: 11 } },
      }),
    ).toBe(
      'Отдых одна минута. Дальше: подход два, двенадцать повторов. В прошлый раз одиннадцать повторов.',
    )
  })

  it('AMRAP is said as «до отказа»', () => {
    expect(
      tapPhrase({ restSec: 60, next: { setNo: 4, weightKg: 60, reps: 'AMRAP', last: null } }),
    ).toBe('Отдых одна минута. Дальше: подход четыре, шестьдесят до отказа.')
  })

  it('drops free-text reps it cannot pronounce', () => {
    expect(
      tapPhrase({ restSec: 60, next: { setNo: 1, weightKg: null, reps: '45-60 с', last: null } }),
    ).toBe('Отдых одна минута. Дальше: подход один.')
  })

  it('never names a weight it does not know', () => {
    expect(
      tapPhrase({ restSec: 60, next: { setNo: 1, weightKg: null, reps: '5', last: null } }),
    ).toBe('Отдых одна минута. Дальше: подход один, пять повторов.')
  })

  it('ends the workout when nothing is left', () => {
    expect(tapPhrase({ restSec: 120, next: null })).toBe('Все упражнения выполнены.')
  })

  it('calls a warm-up set «разминка» without a set number', () => {
    expect(
      tapPhrase({
        restSec: 60,
        next: { warmup: true, setNo: 2, weightKg: 47.5, reps: '5', last: null },
      }),
    ).toBe('Отдых одна минута. Дальше: разминка, сорок семь с половиной на пять.')
  })
})

describe('restOverPhrase', () => {
  it('says the rest is over and the set to do', () => {
    expect(restOverPhrase({ setNo: 2, weightKg: 85, reps: '5', last: null })).toBe(
      'Отдых окончен. Подход два, восемьдесят пять на пять.',
    )
  })

  it('names another exercise and a warm-up', () => {
    expect(
      restOverPhrase({
        exerciseName: 'Присед',
        warmup: true,
        setNo: 1,
        weightKg: 40,
        reps: '8',
        last: null,
      }),
    ).toBe('Отдых окончен. Присед, разминка, сорок на восемь.')
  })

  it('without a next set only says the rest is over', () => {
    expect(restOverPhrase(null)).toBe('Отдых окончен.')
  })
})
