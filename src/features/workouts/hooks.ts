import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Exercise, Program } from '../../db/types'
import { builtInPrograms } from '../../data/programs'
import { useExercises } from '../../data/exercises'
import { ACTIVE_PROGRAM_KEY, HIDE_MEDIA_KEY, findActiveSession } from './actions'
import { buildAliasMap } from './calc'

/** `undefined` while loading, `null` when there is no active session. */
export function useActiveSession() {
  return useLiveQuery(async () => (await findActiveSession()) ?? null, [])
}

export function usePrograms() {
  return useLiveQuery(() => db.programs.toArray(), [])
}

/** All sessions, newest first. */
export function useSessions() {
  return useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), [])
}

/** `undefined` while loading, `null` when missing. */
export function useSession(id: string | undefined) {
  return useLiveQuery(async () => (id ? ((await db.sessions.get(id)) ?? null) : null), [id])
}

/**
 * The program used for "today": `settings.activeProgramId` if it still exists,
 * else the first built-in program, else the first program.
 */
export function useActiveProgram(): { program: Program | null; loading: boolean } {
  const data = useLiveQuery(async () => {
    const [setting, programs] = await Promise.all([db.settings.get(ACTIVE_PROGRAM_KEY), db.programs.toArray()])
    return { activeId: typeof setting?.value === 'string' ? setting.value : null, programs }
  }, [])
  if (!data) return { program: null, loading: true }
  const { activeId, programs } = data
  const program =
    programs.find((p) => p.id === activeId) ?? programs.find((p) => p.isBuiltIn) ?? programs[0] ?? null
  return { program, loading: false }
}

export function useActiveProgramId(): string | null | undefined {
  return useLiveQuery(async () => {
    const s = await db.settings.get(ACTIVE_PROGRAM_KEY)
    return typeof s?.value === 'string' ? s.value : null
  }, [])
}

/** Library indexed by id. */
export function useExerciseMap(): { map: Map<string, Exercise>; exercises: Exercise[]; loading: boolean } {
  const { exercises, loading } = useExercises()
  const map = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])
  return { map, exercises, loading }
}

/** Russian display names from built-in programs, keyed by exercise id (static). */
const builtInAliases = buildAliasMap(builtInPrograms)
export function useExerciseAliases(): Map<string, string[]> {
  return builtInAliases
}

/** Current time, re-rendering every `intervalMs`. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Per-user "hide technique media in sessions" flag; `undefined` while loading. */
export function useHideMedia(): boolean | undefined {
  return useLiveQuery(async () => (await db.settings.get(HIDE_MEDIA_KEY))?.value === true, [])
}
