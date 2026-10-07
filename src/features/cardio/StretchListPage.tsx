import { Card, IconBadge, LinkButton, PageHeader, StaggerList } from '../../components/ui'
import { Icon } from '../../components/icons'
import { WorkoutsNav } from '../../components/WorkoutsNav'
import { plural } from '../../lib/format'
import { routineDurationSec, stretchRoutines } from './stretchRoutines'

export function StretchListPage() {
  return (
    <>
      <PageHeader title="Растяжка" subtitle="Комплексы с таймером — 30 с на сторону" />
      <WorkoutsNav />
      <StaggerList as="ul" className="space-y-3">
        {stretchRoutines.map((r) => {
          const min = Math.round(routineDurationSec(r) / 60)
          return (
            <Card key={r.id} as="div" tone="violet">
              <div className="flex items-start gap-3">
                <IconBadge name="stretch" tone="violet" size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg leading-snug font-semibold tracking-tight">{r.name}</h2>
                  <p className="mt-0.5 text-sm text-muted">{r.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium text-muted tabular-nums">
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5">
                      <Icon name="list" size={13} className="text-violet" />
                      {r.steps.length} {plural(r.steps.length, ['упражнение', 'упражнения', 'упражнений'])}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5">
                      <Icon name="timer" size={13} className="text-violet" />~{min} мин
                    </span>
                  </div>
                </div>
              </div>
              <ol className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3 text-sm">
                {r.steps.map((s, i) => (
                  <li key={`${s.exerciseId}-${i}`} className="flex items-baseline gap-2.5">
                    <span
                      aria-hidden
                      className="grid size-5 shrink-0 translate-y-0.5 place-items-center rounded-full bg-violet/15 text-[10px] font-semibold text-violet tabular-nums"
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">{s.nameRu}</span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {s.perSide ? `${s.holdSec} с × 2` : `${s.holdSec} с`}
                    </span>
                  </li>
                ))}
              </ol>
              <LinkButton
                to={`/cardio/stretch/${r.id}`}
                aria-label={`Начать: ${r.name}`}
                variant="secondary"
                icon="play"
                className="mt-4 w-full [&>svg]:text-violet"
              >
                Начать
              </LinkButton>
            </Card>
          )
        })}
      </StaggerList>
    </>
  )
}
