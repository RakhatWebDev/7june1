import type { Program } from '../../db/types'
import { davidLaidDup } from './davidLaidDup'
import { davidLaidPpl } from './davidLaidPpl'
import { davidLaidProgram1 } from './davidLaidProgram1'

/** Built-in programs seeded into the DB on first run (and re-synced by id). */
export const builtInPrograms: Program[] = [davidLaidProgram1, davidLaidPpl, davidLaidDup]
