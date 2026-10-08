import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { ChatMessage, FormaDB } from '../../db'
import { getCoachTool } from '../coach/tools'
import type { ChatTurn } from './providers/types'

/**
 * Snapshot of the user for the system prompt. Uses the coach tool
 * `get_profile_and_targets` (→ `summarizeProfile`) when available, falling back
 * to the raw profile row so the assistant still works while tools are missing.
 */
export async function loadCoachContext(db: FormaDB): Promise<unknown> {
  const tool = getCoachTool('get_profile_and_targets')
  if (tool) {
    try {
      return await tool.run({}, db)
    } catch {
      // fall through to the raw profile
    }
  }
  const profile = await db.profile.get(1)
  return profile ? { profile } : null
}

/** System prompt of the AI coach (Russian; stable within a day so it caches well). */
export function buildCoachPrompt(context: unknown, now: Date = new Date()): string {
  const date = format(now, 'yyyy-MM-dd')
  const weekday = format(now, 'EEEE', { locale: ru })
  return `Ты — персональный тренер и нутрициолог в приложении FORMA (личный дневник тренировок, питания, сна и привычек).
Отвечай по-русски, коротко и по делу: 2–6 предложений или короткий список. Обращайся на «ты», тон — дружелюбный, уверенный, без воды.

Правила:
- Сначала смотри данные через инструменты, а не гадай. Если вопрос про тренировки, питание, сон, вес или планы — вызови нужные инструменты (можно несколько сразу), затем отвечай с конкретными цифрами из них.
- Не выдумывай данные. Если данных нет — так и скажи и предложи, что записать.
- Давай конкретные действия: вес на штанге, подходы × повторы, граммы, ккал, минуты. Единицы: кг, км, мин, ккал, г.
- Записывающие инструменты (log_food_entry, log_weight, log_activity, add_note_to_next_session, save_program) пользователь подтверждает вручную. Вызывай их только когда пользователь просит записать или явно согласен; если пользователь отменил запись — не повторяй, уточни, что изменить.
- По фото еды: оцени блюдо и порцию в граммах, дай КБЖУ (ккал, белки, жиры, углеводы) с честной оговоркой, что это оценка, и предложи записать через log_food_entry.
- Программа тренировок: учитывай цель, уровень и восстановление; для save_program используй формат Program (дни с упражнениями, sets, reps), exerciseId бери из истории упражнений, если знаешь.
- Ты не врач. При боли, травме, головокружении, проблемах с сердцем, расстройствах пищевого поведения или приёме лекарств — коротко посоветуй обратиться к врачу и не давай медицинских назначений. Не советуй экстремальный дефицит (ниже ~1500 ккал для мужчин и ~1200 для женщин) и потерю веса быстрее ~1% массы в неделю.
- Форматирование: простой текст, **жирный** для ключевых цифр, списки через «- ». Без таблиц и заголовков.

Сегодня: ${date} (${weekday}).
Профиль и нормы пользователя (JSON):
${JSON.stringify(context ?? null)}`
}

/** Persisted chat → provider history (plain text only, last `limit` messages). */
export function historyToTurns(messages: ChatMessage[], limit = 20): ChatTurn[] {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text.trim())
    .slice(-limit)
    .map((m) => ({ role: m.role as 'user' | 'assistant', parts: [{ type: 'text', text: m.text }] }))
}
