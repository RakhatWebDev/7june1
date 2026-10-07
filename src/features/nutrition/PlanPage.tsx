import { useState } from 'react'
import { Link } from 'react-router'
import { db } from '../../db'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  IconBadge,
  Input,
  LinkButton,
  PageHeader,
  SectionHeader,
  Skeleton,
  StaggerList,
  TONE_BG,
  TONE_SOFT,
  type Tone,
} from '../../components/ui'
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
import { n0, n1, MACRO_TONE } from './format'
import { parseNum, useNutritionTargets } from './hooks'
import { NutritionNav } from './ui'

/** Daily targets with the formula spelled out; lets the user set/reset a manual kcal override. */
export function PlanPage() {
  const ctx = useNutritionTargets()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  if (ctx === undefined)
    return (
      <>
        <PageHeader title="Норма питания" />
        <NutritionNav />
        <Skeleton className="h-52 w-full" rounded="rounded-3xl" />
      </>
    )
  if (ctx === null)
    return (
      <>
        <PageHeader title="Норма питания" />
        <NutritionNav />
        <EmptyState
          icon="user"
          tone="warn"
          title="Профиль не заполнен"
          hint="Укажите рост, вес и цель, чтобы рассчитать норму."
          action={
            <LinkButton to="/settings" icon="settings">
              Открыть настройки
            </LinkButton>
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
    await db.profile.update(1, {
      kcalTargetOverride: Math.round(v),
      updatedAt: new Date().toISOString(),
    })
    setDraft('')
  }

  async function resetOverride() {
    await db.profile.update(1, {
      kcalTargetOverride: undefined,
      updatedAt: new Date().toISOString(),
    })
  }

  const steps: Step[] = [
    {
      title: 'BMR — базовый обмен',
      value: `${n0(targets.bmr)} ккал`,
      hint: `Миффлин — Сан Жеор: 10 × ${n1(weightKg)} + 6,25 × ${n0(profile.heightCm)} − 5 × ${age} ${sexConst}`,
      tone: 'muted',
    },
    {
      title: 'TDEE — расход за день',
      value: `${n0(targets.tdee)} ккал`,
      hint: `BMR × ${String(mult).replace('.', ',')} (коэффициент активности)`,
      tone: 'warn',
    },
    {
      title: `Цель: ${GOAL_RU[profile.goal].toLowerCase()}`,
      value: `${n0(computed.kcal)} ккал`,
      hint: adj === 0 ? 'TDEE без изменений' : `TDEE ${pct(adj)}`,
      tone: 'accent',
    },
    {
      title: 'Белки',
      value: `${n0(targets.proteinG)} г`,
      hint: `${n1(ppk)} г × ${n1(weightKg)} кг`,
      tone: MACRO_TONE.proteinG,
    },
    {
      title: 'Жиры',
      value: `${n0(targets.fatG)} г`,
      hint: `${n1(FAT_PER_KG)} г × ${n1(weightKg)} кг`,
      tone: MACRO_TONE.fatG,
    },
    {
      title: 'Углеводы',
      value: `${n0(targets.carbsG)} г`,
      hint: `(${n0(targets.kcal)} − ${n0(targets.proteinG)} × 4 − ${n0(targets.fatG)} × 9) ÷ 4`,
      tone: MACRO_TONE.carbsG,
    },
  ]

  return (
    <>
      <PageHeader title="Норма питания" subtitle={GOAL_RU[profile.goal]} />
      <NutritionNav />

      <Card as="section" variant="accent" tone="warn" className="p-5" aria-label="Дневная норма">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-wide text-muted uppercase">
              Цель, ккал
            </div>
            <div
              className="mt-1.5 text-[44px] leading-none font-bold tracking-tight tabular-nums"
              data-testid="plan-kcal"
            >
              {n0(targets.kcal)}
            </div>
            <span
              className={`mt-2.5 inline-flex min-h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium ${
                hasOverride ? 'bg-warn/15 text-warn' : 'bg-surface-3 text-muted'
              }`}
            >
              <Icon name={hasOverride ? 'edit' : 'sparkles'} size={12} />
              <span>{hasOverride ? 'задано вручную' : 'расчёт'}</span>
            </span>
          </div>
          <IconBadge name="target" tone="warn" size="lg" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-4">
          <MacroTarget
            label="Белки"
            grams={targets.proteinG}
            kcal={targets.proteinG * 4}
            tone={MACRO_TONE.proteinG}
          />
          <MacroTarget
            label="Жиры"
            grams={targets.fatG}
            kcal={targets.fatG * 9}
            tone={MACRO_TONE.fatG}
          />
          <MacroTarget
            label="Углеводы"
            grams={targets.carbsG}
            kcal={targets.carbsG * 4}
            tone={MACRO_TONE.carbsG}
          />
        </div>
      </Card>

      <SectionHeader title="Как считается" icon="info" tone="warn" />
      <Card>
        <p className="mb-4 flex items-start gap-2 text-sm text-muted">
          <Icon name="user" size={16} className="mt-0.5 text-warn" />
          <span>
            {profile.sex === 'male' ? 'Мужчина' : 'Женщина'}, {age} лет, {n0(profile.heightCm)} см,{' '}
            {n1(weightKg)} кг
            {weightFromLog ? ' (последнее взвешивание)' : ' (из профиля)'}.{' '}
            {ACTIVITY_RU[profile.activityLevel]}.
          </span>
        </p>
        <StaggerList as="ol" className="relative">
          {steps.map((st, i) => (
            <TimelineStep key={st.title} index={i} last={i === steps.length - 1} step={st} />
          ))}
        </StaggerList>
      </Card>

      <SectionHeader title="Своя норма калорий" icon="edit" tone="warn" />
      <Card className="space-y-3">
        {hasOverride ? (
          <p className="text-sm text-muted">
            Сейчас задано вручную:{' '}
            <span className="text-text">{n0(profile.kcalTargetOverride!)} ккал</span> (расчёт —{' '}
            {n0(computed.kcal)} ккал).
          </p>
        ) : (
          <p className="text-sm text-muted">
            Используется расчётное значение. Можно задать своё — макросы пересчитаются.
          </p>
        )}
        <div className="flex items-end gap-2">
          <Field label="Ккал в день" className="min-w-0 flex-1">
            <Input
              inputMode="numeric"
              placeholder={String(targets.kcal)}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="tabular-nums"
            />
          </Field>
          <Button
            icon="check"
            className="min-h-[46px]"
            onClick={saveOverride}
            disabled={!draft.trim()}
          >
            Сохранить
          </Button>
        </div>
        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-danger">
            <Icon name="info" size={15} />
            {error}
          </p>
        )}
        {hasOverride && (
          <Button variant="secondary" icon="history" className="w-full" onClick={resetOverride}>
            Сбросить к расчёту
          </Button>
        )}
      </Card>

      <p className="mt-4 flex items-start gap-2 px-0.5 text-sm text-muted">
        <Icon name="settings" size={16} className="mt-0.5 shrink-0" />
        <span>
          Рост, вес, возраст, активность и цель меняются в{' '}
          <Link to="/settings" className="text-warn underline-offset-2 hover:underline">
            настройках профиля
          </Link>
          . Вес берётся из последнего взвешивания, если оно есть.
        </span>
      </p>
    </>
  )
}

type Step = { title: string; value: string; hint: string; tone: Tone }

/** One formula step on the vertical timeline: numbered dot, connector, title + big tabular value. */
function TimelineStep({ step, index, last }: { step: Step; index: number; last: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums ${TONE_SOFT[step.tone]}`}
        >
          {index + 1}
        </span>
        {!last && <span aria-hidden className="my-1 w-px flex-1 bg-white/[0.08]" />}
      </div>
      <div className={`min-w-0 flex-1 ${last ? '' : 'pb-4'}`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 pt-1 text-sm font-medium">{step.title}</span>
          <span
            className={`shrink-0 text-lg font-semibold tracking-tight tabular-nums ${index === 2 ? 'text-accent' : ''}`}
          >
            {step.value}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted tabular-nums">{step.hint}</p>
      </div>
    </div>
  )
}

function MacroTarget({
  label,
  grams,
  kcal,
  tone,
}: {
  label: string
  grams: number
  kcal: number
  tone: Tone
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${TONE_BG[tone]}`} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
        {n0(grams)}
        <span className="ml-0.5 text-xs font-medium text-muted">г</span>
      </div>
      <div className="text-[11px] text-muted tabular-nums">{n0(kcal)} ккал</div>
    </div>
  )
}
