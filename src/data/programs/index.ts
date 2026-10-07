import type { Program } from '../../db/types'
import { davidLaidDup } from './davidLaidDup'

/** Built-in programs seeded into the DB on first run (and re-synced by id). */
export const builtInPrograms: Program[] = [davidLaidDup]
