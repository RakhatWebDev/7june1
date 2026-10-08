import { useState } from 'react'
import { Card, Chip, EmptyState, IconBadge, LinkButton, PageHeader, SectionHeader, Skeleton, StaggerList } from '../../components/ui'
import { db } from '../../db'
import { plural } from '../../lib/format'
import { useCoachState } from './hooks'
import { dismissInsight, RULES, undismissInsight, setRuleEnabled, type Insight, type InsightKind } from './insights'
import { KIND_META, KIND_ORDER } from './meta'
import { InsightItem, Switch } from './parts'

type Filter = InsightKind | 'all'

export function CoachPage() {
  const state = useCoachState()
  const [filter, setFilter] = useState<Filter>('all')
  const [showHidden, setShowHidden] = useState(false)

  const dismissed = new Set(state?.dismissed ?? [])
  const visible = (state?.all ?? []).filter((i) => !dismissed.has(i.id))
  const hidden = (state?.all ?? []).filter((i) => dismissed.has(i.id))
  const kinds = KIND_ORDER.filter((k) => visible.some((i) => i.kind === k))
  const activeFilter: Filter = filter !== 'all' && !kinds.includes(filter) ? 'all' : filter
  const shown = activeFilter === 'all' ? visible : visible.filter((i) => i.kind === activeFilter)
  const groups = KIND_ORDER.map((k) => ({ kind: k, items: shown.filter((i) => i.kind === k) })).filter((g) => g.items.length)

  return (
    <>
      <PageHeader title="Тренер" eyebrow="Советы по правилам" back="/" />

      <Card variant="accent" tone="violet">
        <div className="flex items-center gap-3">
          <IconBadge name="brain" tone="violet" size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug font-semibold">Нужен разбор посложнее?</p>
            <p className="text-xs text-muted">ИИ-тренер ответит на вопросы и составит план по твоим данным.</p>
          </div>
        </div>
        <LinkButton to="/assistant" variant="secondary" className="mt-3 w-full" icon="sparkles" iconRight="chevron-right">
          Поговорить с ИИ-тренером
        </LinkButton>
      </Card>

      {state === undefined ? (
        <div className="mt-6 space-y-3" aria-busy>
          <Skeleton className="h-24" rounded="rounded-3xl" />
          <Skeleton className="h-24" rounded="rounded-3xl" />
        </div>
      ) : (
        <>
          {visible.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-5 overflow-x-auto px-4 pb-1">
              <div className="flex w-max gap-2" role="group" aria-label="Категории">
                <Chip active={activeFilter === 'all'} onClick={() => setFilter('all')}>
                  Все · {visible.length}
                </Chip>
                {kinds.map((k) => (
                  <Chip
                    key={k}
                    icon={KIND_META[k].icon}
                    tone={KIND_META[k].tone}
                    active={activeFilter === k}
                    onClick={() => setFilter(k)}
                  >
                    {KIND_META[k].label} · {visible.filter((i) => i.kind === k).length}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {groups.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon="check"
                title="Сейчас советов нет"
                hint="Всё идёт по плану. Тренер проверяет тренировки, питание, сон и привычки — новые советы появятся здесь."
              />
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.kind} aria-label={KIND_META[g.kind].label}>
                <SectionHeader
                  title={KIND_META[g.kind].label}
                  icon={KIND_META[g.kind].icon}
                  tone={KIND_META[g.kind].tone}
                  subtitle={`${g.items.length} ${plural(g.items.length, ['совет', 'совета', 'советов'])}`}
                />
                <StaggerList className="flex flex-col gap-2">
                  {g.items.map((ins: Insight) => (
                    <InsightItem key={ins.id} insight={ins} showEvidence onDismiss={() => void dismissInsight(db, ins.id)} />
                  ))}
                </StaggerList>
              </section>
            ))
          )}

          {hidden.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowHidden((v) => !v)}
                aria-expanded={showHidden}
                className="text-sm font-medium text-muted transition-colors hover:text-text"
              >
                {showHidden ? 'Свернуть скрытые' : `Скрыто на сегодня: ${hidden.length}`}
              </button>
              {showHidden && (
                <div className="mt-2 flex flex-col gap-2">
                  {hidden.map((ins) => (
                    <InsightItem key={ins.id} insight={ins} dimmed onRestore={() => void undismissInsight(db, ins.id)} />
                  ))}
                </div>
              )}
            </div>
          )}

          <SectionHeader title="Правила" icon="settings" subtitle="Выключенные правила не дают советов" />
          <Card padding="none">
            <ul className="divide-y divide-white/[0.06]">
              {RULES.map((r) => {
                const on = state.rules[r.id] !== false
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <IconBadge name={KIND_META[r.kind].icon} tone={on ? KIND_META[r.kind].tone : 'muted'} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted break-words">{r.description}</p>
                    </div>
                    <Switch checked={on} label={r.name} onChange={(v) => void setRuleEnabled(db, r.id, v)} />
                  </li>
                )
              })}
            </ul>
          </Card>
        </>
      )}
    </>
  )
}
