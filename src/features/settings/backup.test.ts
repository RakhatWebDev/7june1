import { afterEach, describe, expect, it } from 'vitest'
import { FormaDB } from '../../db'
import { ensureSeeded } from '../../db/seed'
import { builtInPrograms } from '../../data/programs'
import { backupFileName, exportData, importData, parseBackup, resetData, summarize, validateBackup } from './backup'

const dbs: FormaDB[] = []
function freshDb() {
  const d = new FormaDB(`test-backup-${Math.random().toString(36).slice(2)}`)
  dbs.push(d)
  return d
}

afterEach(async () => {
  for (const d of dbs.splice(0)) await d.delete()
})

async function fill(d: FormaDB) {
  await ensureSeeded(d)
  await d.profile.update(1, { name: 'Тест', weightKg: 90 })
  await d.weights.bulkPut([
    { id: 'w1', date: '2026-10-01', weightKg: 89.5 },
    { id: 'w2', date: '2026-10-05', weightKg: 88.9, bodyFatPct: 15 },
  ])
  await d.sessions.put({
    id: 's1',
    name: 'Ноги',
    startedAt: '2026-10-05T10:00:00.000Z',
    finishedAt: '2026-10-05T11:00:00.000Z',
    exercises: [
      { exerciseId: 'Barbell_Squat', name: 'Присед', targetSets: 1, targetReps: '5', sets: [{ weightKg: 100, reps: 5, done: true }] },
    ],
  })
  await d.activities.put({ id: 'a1', type: 'run', date: '2026-10-05', durationMin: 30, distanceKm: 5 })
  await d.sleep.put({
    id: 'sl1',
    date: '2026-10-05',
    bedtime: '2026-10-04T22:00:00.000Z',
    wakeTime: '2026-10-05T06:00:00.000Z',
    durationMin: 480,
    quality: 4,
  })
  await d.settings.put({ key: 'activeProgramId', value: 'david-laid-dup' })
}

describe('backup', () => {
  it('round-trips every table through JSON export → import', async () => {
    const source = freshDb()
    await fill(source)
    const backup = await exportData(source)
    expect(backup.version).toBe(1)
    expect(typeof backup.exportedAt).toBe('string')
    expect(Object.keys(backup.tables).sort()).toEqual(source.tables.map((t) => t.name).sort())

    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const target = freshDb()
    await ensureSeeded(target)
    await target.weights.put({ id: 'stale', date: '2020-01-01', weightKg: 120 })
    await importData(target, parsed.backup)

    for (const t of source.tables) {
      const a = await t.toArray()
      const b = await target.table(t.name).toArray()
      expect(b, t.name).toEqual(a)
    }
    expect(await target.weights.get('stale')).toBeUndefined()
    expect((await target.profile.get(1))?.name).toBe('Тест')
  })

  it('re-seeds defaults when importing a backup without profile and programs', async () => {
    const target = freshDb()
    const empty = {
      version: 1,
      exportedAt: '',
      tables: Object.fromEntries(target.tables.map((t) => [t.name, []])),
    }
    const res = validateBackup(empty)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    await importData(target, res.backup)
    expect(await target.profile.get(1)).toBeDefined()
    expect(await target.programs.count()).toBe(builtInPrograms.length)
  })

  it('rejects malformed backups', () => {
    expect(parseBackup('not json').ok).toBe(false)
    expect(validateBackup(null).ok).toBe(false)
    expect(validateBackup({ version: 2, tables: {} }).ok).toBe(false)
    expect(validateBackup({ version: 1 }).ok).toBe(false)
    const missing = validateBackup({ version: 1, tables: { profile: [] } })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error).toMatch(/programs/)
    const tables = Object.fromEntries(
      ['profile', 'programs', 'sessions', 'activities', 'foods', 'foodEntries', 'water', 'weights', 'measurements', 'sleep', 'settings'].map(
        (t) => [t, [] as unknown[]],
      ),
    )
    expect(validateBackup({ version: 1, tables }).ok).toBe(true)
    expect(validateBackup({ version: 1, tables: { ...tables, weights: {} } }).ok).toBe(false)
    expect(validateBackup({ version: 1, tables: { ...tables, weights: [1, 2] } }).ok).toBe(false)
  })

  it('does not modify the database when rows lack primary keys', async () => {
    const target = freshDb()
    await fill(target)
    const before = await target.weights.count()
    const backup = await exportData(target)
    backup.tables.weights = [{ date: '2026-01-01', weightKg: 80 }]
    await expect(importData(target, backup)).rejects.toThrow(/ключа/)
    expect(await target.weights.count()).toBe(before)
  })

  it('reset clears all data and re-seeds', async () => {
    const d = freshDb()
    await fill(d)
    await resetData(d)
    expect(await d.weights.count()).toBe(0)
    expect(await d.sessions.count()).toBe(0)
    expect(await d.settings.count()).toBe(0)
    expect((await d.profile.get(1))?.name).toBe('Рахат')
    expect(await d.programs.count()).toBe(builtInPrograms.length)
  })

  it('names the file by date and summarizes counts', async () => {
    expect(backupFileName('2026-10-07')).toBe('forma-backup-2026-10-07.json')
    const d = freshDb()
    await fill(d)
    const summary = summarize(await exportData(d))
    expect(summary.find((s) => s.table === 'weights')).toEqual({ table: 'weights', label: 'Вес', count: 2 })
  })
})
