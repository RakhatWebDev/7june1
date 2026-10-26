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

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. Route only to skills in the session's available-skills list; answer directly for quick questions or small scoped edits.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
