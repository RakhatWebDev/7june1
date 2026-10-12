import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db } from '../../../db'
import { ensureSeeded } from '../../../db/seed'
import { __setExercisesForTests } from '../../../data/exercises'
import { startSession } from '../actions'
import { clearDb, makeExercise, renderRoute } from './helpers'

const quads = { primaryMuscles: ['quadriceps'], force: 'push' as const, mechanic: 'compound' as const }

beforeEach(async () => {
  __setExercisesForTests([
    makeExercise({ id: 'Barbell_Squat', name: 'Barbell Squat', ...quads }),
    makeExercise({ id: 'Leg_Press', name: 'Leg Press', equipment: 'machine', ...quads }),
    makeExercise({ id: 'Front_Barbell_Squat', name: 'Front Barbell Squat', ...quads }),
    makeExercise({ id: 'Goblet_Squat', name: 'Goblet Squat', equipment: 'kettlebells', ...quads }),
    makeExercise({ id: 'Barbell_Curl', name: 'Barbell Curl', primaryMuscles: ['biceps'], force: 'pull' }),
  ])
  await clearDb()
  await ensureSeeded()
})

describe('replace an exercise', () => {
  it('suggests alternatives and replaces only in today’s session', async () => {
    const id = await startSession('david-laid-program-1', 'p1-legs', db)
    renderRoute(`/workouts/session/${id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Заменить: Присед' }))
    const sheet = await screen.findByRole('dialog', { name: 'Альтернативы для Присед' })
    const list = within(sheet).getByTestId('alternatives')
    // curated first: Leg_Press, Front_Barbell_Squat; the unrelated curl is not suggested
    await waitFor(() => expect(within(list).getAllByRole('button')[0]).toHaveTextContent('Жим ногами'))
    expect(within(list).getAllByRole('button')[1]).toHaveTextContent(/Фронтальный присед/)
    expect(within(list).queryByText(/Barbell Curl/)).not.toBeInTheDocument()
    expect(await within(sheet).findByRole('radio', { name: 'Только сегодня' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(list).getAllByRole('button')[1])
    await waitFor(async () => expect((await db.sessions.get(id))?.exercises[0].exerciseId).toBe('Front_Barbell_Squat'))
    expect((await db.sessions.get(id))?.exercises[0].notes).toBe('Замена: Присед')
    expect(await screen.findByText('Замена: Присед')).toBeInTheDocument()
    expect(await db.settings.get('program.overrides:david-laid-program-1')).toBeUndefined()
  })

  it('«Заменить в программе» stores an override, shown on the program page with «вернуть оригинал»', async () => {
    const id = await startSession('david-laid-program-1', 'p1-push-1', db)
    const s = (await db.sessions.get(id))!
    const pushups = s.exercises.findIndex((e) => e.exerciseId === 'Pushups')
    expect(pushups).toBeGreaterThan(0)
    // search the whole library from the sheet (list mode: the exercise is not the first one)
    await db.settings.put({ key: 'session.viewMode', value: 'list' })
    const view = renderRoute(`/workouts/session/${id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Заменить: Отжимания' }))
    const sheet = await screen.findByRole('dialog', { name: 'Альтернативы для Отжимания' })
    fireEvent.click(await within(sheet).findByRole('radio', { name: 'Заменить в программе' }))
    fireEvent.change(within(sheet).getByLabelText('Поиск замены'), { target: { value: 'goblet' } })
    fireEvent.click(await within(sheet).findByRole('button', { name: /Goblet Squat/ }))
    await waitFor(async () =>
      expect((await db.settings.get('program.overrides:david-laid-program-1'))?.value).toEqual({
        'p1-push-1': { '5': { exerciseId: 'Goblet_Squat', name: 'Goblet Squat' } },
      }),
    )
    view.unmount()

    renderRoute('/workouts/programs/david-laid-program-1')
    const week1 = await screen.findByTestId('week-card-1')
    const revert = await within(week1).findByRole('button', { name: 'Вернуть оригинал: Отжимания' })
    expect(within(week1).getByRole('link', { name: /^Goblet Squat/ })).toHaveTextContent('Замена: Отжимания')
    fireEvent.click(revert)
    await waitFor(async () =>
      expect((await db.settings.get('program.overrides:david-laid-program-1'))?.value).toEqual({}),
    )
    expect(await within(week1).findByRole('link', { name: /^Отжимания/ })).toBeInTheDocument()
  })

  it('browses replacements by muscle group and equipment; search narrows within the group', async () => {
    const id = await startSession('david-laid-program-1', 'p1-legs', db)
    renderRoute(`/workouts/session/${id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Заменить: Присед' }))
    const sheet = await screen.findByRole('dialog', { name: 'Альтернативы для Присед' })
    fireEvent.click(within(sheet).getByRole('radio', { name: 'По категориям' }))
    const groups = within(sheet).getByRole('group', { name: 'Группа мышц' })
    // preselected from the replaced exercise
    expect(within(groups).getByRole('button', { name: 'Ноги' })).toHaveAttribute('aria-pressed', 'true')
    const results = within(sheet).getByTestId('category-results')
    expect(within(results).getByText('Жим ногами')).toBeInTheDocument()
    expect(within(results).queryByText(/Barbell Curl/)).not.toBeInTheDocument()
    // the exercise being replaced is not offered
    expect(within(results).queryByText('Barbell Squat')).not.toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Тренажёр' }))
    expect(within(results).getAllByRole('button')).toHaveLength(1)
    expect(within(results).getByText('Жим ногами')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Тренажёр' }))

    fireEvent.change(within(sheet).getByLabelText('Поиск замены'), { target: { value: 'goblet' } })
    expect(within(results).getAllByRole('button')).toHaveLength(1)
    expect(within(results).getByText('Goblet Squat')).toBeInTheDocument()
    fireEvent.click(within(groups).getByRole('button', { name: 'Бицепс' }))
    expect(within(sheet).getByText('Ничего не найдено')).toBeInTheDocument()
    fireEvent.change(within(sheet).getByLabelText('Поиск замены'), { target: { value: '' } })
    fireEvent.click(await within(results).findByRole('button', { name: /Barbell Curl/ }))
    await waitFor(async () => expect((await db.sessions.get(id))?.exercises[0].exerciseId).toBe('Barbell_Curl'))
  })
})
