import { db as defaultDb, type FormaDB } from '../../db'
import { ensureSeeded } from '../../db/seed'
import { today } from '../../lib/dates'

/* ------------------------------------------------------------------ */
/* JSON backup of every Dexie table. All functions take the database   */
/* instance so they can be tested against an isolated FormaDB.         */
/* ------------------------------------------------------------------ */

export const BACKUP_VERSION = 1

/** Tables every backup must contain (schema v1). Newer tables are optional and default to empty. */
export const REQUIRED_TABLES = [
  'profile',
  'programs',
  'sessions',
  'activities',
  'foods',
  'foodEntries',
  'water',
  'weights',
  'measurements',
  'sleep',
  'settings',
] as const

export interface Backup {
  version: typeof BACKUP_VERSION
  exportedAt: string
  tables: Record<string, Record<string, unknown>[]>
}

export type ValidationResult = { ok: true; backup: Backup } | { ok: false; error: string }

export const TABLE_LABELS_RU: Record<string, string> = {
  profile: 'Профиль',
  programs: 'Программы',
  sessions: 'Тренировки',
  activities: 'Активности',
  foods: 'Продукты',
  foodEntries: 'Записи питания',
  water: 'Вода',
  weights: 'Вес',
  measurements: 'Замеры',
  sleep: 'Сон',
  settings: 'Настройки',
  calendarEvents: 'События календаря',
  calendarFeeds: 'Календари',
}

export async function exportData(database: FormaDB = defaultDb): Promise<Backup> {
  const tables: Backup['tables'] = {}
  await database.transaction('r', database.tables, async () => {
    for (const t of database.tables) tables[t.name] = (await t.toArray()) as Record<string, unknown>[]
  })
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables }
}

export function backupFileName(date: string = today()): string {
  return `forma-backup-${date}.json`
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Structural validation of parsed JSON. Error messages are user-facing (Russian). */
export function validateBackup(data: unknown): ValidationResult {
  if (!isObject(data)) return { ok: false, error: 'Файл не похож на резервную копию FORMA.' }
  if (data.version !== BACKUP_VERSION) {
    return { ok: false, error: `Неподдерживаемая версия копии: ${String(data.version ?? 'нет')}.` }
  }
  if (!isObject(data.tables)) return { ok: false, error: 'В файле нет раздела «tables».' }
  const missing = REQUIRED_TABLES.filter((t) => !(t in (data.tables as object)))
  if (missing.length) return { ok: false, error: `Не хватает таблиц: ${missing.join(', ')}.` }
  for (const [name, rows] of Object.entries(data.tables)) {
    if (!Array.isArray(rows)) return { ok: false, error: `Таблица «${name}» должна быть списком.` }
    if (!rows.every(isObject)) return { ok: false, error: `В таблице «${name}» есть некорректные записи.` }
  }
  return {
    ok: true,
    backup: {
      version: BACKUP_VERSION,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      tables: data.tables as Backup['tables'],
    },
  }
}

export function parseBackup(text: string): ValidationResult {
  try {
    return validateBackup(JSON.parse(text))
  } catch {
    return { ok: false, error: 'Не удалось прочитать JSON.' }
  }
}

/** Row counts per table of a backup, in a stable order. */
export function summarize(backup: Backup): { table: string; label: string; count: number }[] {
  return Object.entries(backup.tables).map(([table, rows]) => ({
    table,
    label: TABLE_LABELS_RU[table] ?? table,
    count: rows.length,
  }))
}

/**
 * Replaces the contents of every table with the backup in a single transaction (tables missing from
 * the backup end up empty, unknown tables are ignored), then re-seeds defaults (profile, built-in programs).
 */
export async function importData(database: FormaDB, backup: Backup): Promise<void> {
  // Check primary keys before touching anything, so a bad file never leaves the DB half-replaced.
  for (const t of database.tables) {
    const keyPath = t.schema.primKey.keyPath
    const rows = backup.tables[t.name] ?? []
    if (typeof keyPath === 'string' && rows.some((r) => r[keyPath] == null)) {
      throw new Error(`В таблице «${TABLE_LABELS_RU[t.name] ?? t.name}» есть записи без ключа «${keyPath}».`)
    }
  }
  await database.transaction('rw', database.tables, async () => {
    for (const t of database.tables) {
      await t.clear()
      const rows = backup.tables[t.name]
      if (rows?.length) await t.bulkPut(rows)
    }
  })
  await ensureSeeded(database)
}

/** Wipes all tables and re-creates defaults. */
export async function resetData(database: FormaDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    for (const t of database.tables) await t.clear()
  })
  await ensureSeeded(database)
}

/** Triggers a browser download of the backup as a JSON file. */
export function downloadBackup(backup: Backup, fileName = backupFileName()): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
