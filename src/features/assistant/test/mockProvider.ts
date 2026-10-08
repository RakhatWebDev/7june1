import type { CoachTool } from '../../coach/tools'
import type { ChatEvent, ChatRequest, Provider } from '../providers/types'

/** Provider that replays one scripted event list per request and records the requests. */
export function scriptedProvider(rounds: ChatEvent[][], id: Provider['id'] = 'gemini') {
  const requests: ChatRequest[] = []
  const provider: Provider = {
    id,
    label: 'Mock',
    isConfigured: () => true,
    async *chat(req) {
      requests.push({ ...req, messages: structuredClone(req.messages) })
      const events = rounds[requests.length - 1] ?? [{ type: 'done', stopReason: 'end_turn' }]
      for (const e of events) {
        await Promise.resolve()
        yield e
      }
    },
  }
  return { provider, requests }
}

export function mockTool(name: string, run: CoachTool['run'], mutates = false): CoachTool {
  return {
    name,
    description: `${name} (mock)`,
    inputSchema: { type: 'object', properties: {} },
    mutates,
    run,
  }
}
