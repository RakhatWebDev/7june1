import { Link } from 'react-router'
import { Card, PageHeader } from '../../components/ui'
import { WorkoutsNav } from '../../components/WorkoutsNav'
import { plural } from '../../lib/format'
import { routineDurationSec, stretchRoutines } from './stretchRoutines'

export function StretchListPage() {
  return (
    <>
      <PageHeader title="Растяжка" subtitle="Комплексы с таймером — 30 с на сторону" />
      <WorkoutsNav />
      <ul className="space-y-3">
        {stretchRoutines.map((r) => {
          const min = Math.round(routineDurationSec(r) / 60)
          return (
            <li key={r.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{r.name}</h2>
                    <p className="text-sm text-muted">{r.description}</p>
                    <p className="mt-1 text-xs text-muted">
                      {r.steps.length} {plural(r.steps.length, ['упражнение', 'упражнения', 'упражнений'])} · ~{min} мин
                    </p>
                  </div>
                  <Link
                    to={`/cardio/stretch/${r.id}`}
                    aria-label={`Начать: ${r.name}`}
                    className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-strong"
                  >
                    Начать
                  </Link>
                </div>
                <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-sm text-muted">
                  {r.steps.map((s, i) => (
                    <li key={`${s.exerciseId}-${i}`}>
                      {s.nameRu}
                      {s.perSide ? ` — ${s.holdSec} с × 2 стороны` : ` — ${s.holdSec} с`}
                    </li>
                  ))}
                </ol>
              </Card>
            </li>
          )
        })}
      </ul>
    </>
  )
}
