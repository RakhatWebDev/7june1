import { Link } from 'react-router'
import { Card, Icon, IconBadge } from '../../components/ui'
import { QUICK_QUESTIONS } from './questions'
import { useAiSettings } from './settings'

const ASK_QUESTIONS = QUICK_QUESTIONS.slice(0, 3)

const chipLink =
  'inline-flex min-h-8 items-center rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted transition-[background-color,color,transform] hover:text-text active:scale-95 motion-reduce:active:scale-100'

/** «Спросить тренера» — entry to the AI chat with three ready questions (for «Сегодня» / «Тренер»). */
export function AskCoachCard({ className = '' }: { className?: string }) {
  const settings = useAiSettings()
  const configured = settings ? settings.provider !== 'off' : true
  return (
    <Card className={className} tone="violet">
      <Link to="/assistant" className="-m-1 flex items-center gap-3 rounded-2xl p-1">
        <IconBadge name="sparkles" tone="violet" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-semibold tracking-tight">Спросить тренера</h2>
          <p className="truncate text-sm text-muted">
            {configured ? 'ИИ посмотрит твои данные и ответит' : 'Подключи ИИ за минуту — бесплатно'}
          </p>
        </div>
        <Icon name="chevron-right" size={20} className="shrink-0 text-muted" />
      </Link>
      {configured && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ASK_QUESTIONS.map((q) => (
            <Link key={q} to={`/assistant?q=${encodeURIComponent(q)}`} className={chipLink}>
              {q}
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}
