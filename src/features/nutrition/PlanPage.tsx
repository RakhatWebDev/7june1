import { useState } from 'react'
import { Link } from 'react-router'
import { db } from '../../db'
import { Button, Card, EmptyState, Field, Input, PageHeader, Stat } from '../../components/ui'
import {
  ACTIVITY_MULTIPLIERS,
  ACTIVITY_RU,
  DEFAULT_PROTEIN_PER_KG,
  FAT_PER_KG,
  GOAL_ADJUSTMENTS,
  GOAL_RU,
  ageFromBirthYear,
  computeTargets,
} from './calc'
import { n0, n1 } from './format'
import { parseNum, useNutritionTargets } from './hooks'

/** Daily targets with the formula spelled out; lets the user set/reset a manual kcal override. */
export function PlanPage() {
  const ctx = useNutritionTargets()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  if (ctx === undefined) return <PageHeader title="Норма питания" back="/nutrition" />
  if (ctx === null)
    return (
      <>
        <PageHeader title="Норма питания" back="/nutrition" />
        <EmptyState
          title="Профиль не заполнен"
          hint="Укажите рост, вес и цель, чтобы рассчитать норму."
          action={
            <Link to="/settings" className="text-accent">
              Открыть настройки
            </Link>
          }
        />
      </>
    )

  const { profile, weightKg, weightFromLog, targets } = ctx
  const computed = computeTargets({ ...profile, kcalTargetOverride: undefined }, weightKg)
  const age = ageFromBirthYear(profile.birthYear)
  const mult = ACTIVITY_MULTIPLIERS[profile.activityLevel]
  const adj = GOAL_ADJUSTMENTS[profile.goal]
  const ppk = profile.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG
  const hasOverride = profile.kcalTargetOverride != null && profile.kcalTargetOverride > 0
  const sexConst = profile.sex === 'male' ? '+ 5' : '− 161'
  const pct = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 100))} %`

  async function saveOverride() {
    const v = parseNum(draft)
    if (!Number.isFinite(v) || v < 800 || v > 8000) return setError('Введите число от 800 до 8000')
    setError('')
    await db.profile.update(1, { kcalTargetOverride: Math.round(v), updatedAt: new Date().toISOString() })
    setDraft('')
  }

  async function resetOverride() {
    await db.profile.update(1, { kcalTargetOverride: undefined, updatedAt: new Date().toISOString() })
  }

  return (
    <>
      <PageHeader title="Норма питания" subtitle={GOAL_RU[profile.goal]} back="/nutrition" />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Цель, ккал" value={<span data-testid="plan-kcal">{n0(targets.kcal)}</span>} sub={hasOverride ? 'задано вручную' : 'расчёт'} />
        <Stat label="Белки" value={`${n0(targets.proteinG)} г`} sub={`${n0(targets.proteinG * 4)} ккал`} />
        <Stat label="Жиры" value={`${n0(targets.fatG)} г`} sub={`${n0(targets.fatG * 9)} ккал`} />
        <Stat label="Углеводы" value={`${n0(targets.carbsG)} г`} sub={`${n0(targets.carbsG * 4)} ккал`} />
      </div>

      <Card className="mb-4 space-y-3 text-sm">
        <h2 className="text-base font-semibold">Как считается</h2>
        <p className="text-muted">
          {profile.sex === 'male' ? 'Мужчина' : 'Женщина'}, {age} лет, {n0(profile.heightCm)} см, {n1(weightKg)} кг
          {weightFromLog ? ' (последнее взвешивание)' : ' (из профиля)'}. {ACTIVITY_RU[profile.activityLevel]}.
        </p>
        <Row
          title="BMR — базовый обмен"
          value={`${n0(targets.bmr)} ккал`}
          hint={`Миффлин — Сан Жеор: 10 × ${n1(weightKg)} + 6,25 × ${n0(profile.heightCm)} − 5 × ${age} ${sexConst}`}
        />
        <Row
          title="TDEE — расход за день"
          value={`${n0(targets.tdee)} ккал`}
          hint={`BMR × ${String(mult).replace('.', ',')} (коэффициент активности)`}
        />
        <Row
          title={`Цель: ${GOAL_RU[profile.goal].toLowerCase()}`}
          value={`${n0(computed.kcal)} ккал`}
          hint={adj === 0 ? 'TDEE без изменений' : `TDEE ${pct(adj)}`}
        />
        <Row
          title="Белки"
          value={`${n0(targets.proteinG)} г`}
          hint={`${n1(ppk)} г × ${n1(weightKg)} кг`}
        />
        <Row title="Жиры" value={`${n0(targets.fatG)} г`} hint={`${n1(FAT_PER_KG)} г × ${n1(weightKg)} кг`} />
        <Row
          title="Углеводы"
          value={`${n0(targets.carbsG)} г`}
          hint={`(${n0(targets.kcal)} − ${n0(targets.proteinG)} × 4 − ${n0(targets.fatG)} × 9) ÷ 4`}
        />
      </Card>

      <Card className="mb-4 space-y-3">
        <h2 className="font-semibold">Своя норма калорий</h2>
        {hasOverride ? (
          <p className="text-sm text-muted">
            Сейчас задано вручную: <span className="text-text">{n0(profile.kcalTargetOverride!)} ккал</span> (расчёт —{' '}
            {n0(computed.kcal)} ккал).
          </p>
        ) : (
          <p className="text-sm text-muted">Используется расчётное значение. Можно задать своё — макросы пересчитаются.</p>
        )}
        <div className="flex items-end gap-2">
          <Field label="Ккал в день" className="flex-1">
            <Input
              inputMode="numeric"
              placeholder={String(targets.kcal)}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </Field>
          <Button onClick={saveOverride} disabled={!draft.trim()}>
            Сохранить
          </Button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {hasOverride && (
          <Button variant="secondary" onClick={resetOverride}>
            Сбросить к расчёту
          </Button>
        )}
      </Card>

      <p className="text-sm text-muted">
        Рост, вес, возраст, активность и цель меняются в{' '}
        <Link to="/settings" className="text-accent">
          настройках профиля
        </Link>
        . Вес берётся из последнего взвешивания, если оно есть.
      </p>
    </>
  )
}

function Row({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border pt-3 first-of-type:border-0">
      <div className="min-w-0">
        <div>{title}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      <div className="shrink-0 font-medium">{value}</div>
    </div>
  )
}
