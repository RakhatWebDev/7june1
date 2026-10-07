import type { FormaDB } from '../../db'

/**
 * Tool registry shared by the rule-based coach and the AI assistant.
 * Every tool runs IN THE BROWSER against IndexedDB; only its JSON output
 * is ever sent to an AI provider. Agent K implements the tools, Agent L
 * converts `CoachTool[]` into provider-specific function declarations.
 */
export interface CoachTool {
  name: string
  /** One-paragraph description for the model (English) */
  description: string
  /** JSON Schema (draft-07 subset: object with properties/required) */
  inputSchema: Record<string, unknown>
  /** True when the tool writes to the database; the UI asks the user to confirm first */
  mutates?: boolean
  run: (input: Record<string, unknown>, db: FormaDB) => Promise<unknown>
}

export const COACH_TOOLS: CoachTool[] = []

export function getCoachTool(name: string): CoachTool | undefined {
  return COACH_TOOLS.find((t) => t.name === name)
}
