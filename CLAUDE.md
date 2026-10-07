# FORMA — notes for coding agents

Read `docs/ARCHITECTURE.md` first; it contains the folder ownership rules and the data schema.
Quick facts:

- Stack: Vite + React 19 + TS + Tailwind v4 + Dexie + react-router (hash) + Recharts + Vitest.
- Run `npm run check` before reporting (typecheck, lint, tests, build must all pass).
- UI language: Russian. Code, comments and commit messages: English.
- Data access: `useLiveQuery` from `dexie-react-hooks` for reads; `db.*` from `src/db` for writes.
- Exercise library: `useExercises()` / `getExercise()` in `src/data/exercises.ts`; demo images via
  `<ExerciseMedia exercise={...} />`.
- Never modify `src/db`, `src/components`, `src/lib`, `src/app`, `package.json` unless you are the
  architect; feature agents stay inside `src/features/<feature>/`.
- Do not commit or push; the architect commits.
