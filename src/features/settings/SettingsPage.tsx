import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { DEFAULT_PROFILE } from '../../db/seed'
import type { ActivityLevel, Goal, Profile, Sex } from '../../db/types'
import {
  Button,
  Card,
  Field,
  Icon,
  IconBadge,
  Input,
  PageHeader,
  SectionHeader,
  Select,
  Sheet,
} from '../../components/ui'
import {
  backupFileName,
  downloadBackup,
  exportData,
  importData,
  parseBackup,
  resetData,
  summarize,
  type Backup,
} from './backup'
import {
  ACTIVITY_LEVEL_RU,
  GOAL_LABEL_RU,
  SEX_RU,
  fromFormValues,
  toFormValues,
  type ProfileErrors,
  type ProfileFormValues,
} from './profileForm'

export function SettingsPage() {
  // `null` = loaded but missing, `undefined` = still loading
  const profile = useLiveQuery(() => db.profile.get(1).then((p) => p ?? null), [])
  // Bumped after import/reset so the profile form re-reads the replaced data
  const [generation, setGeneration] = useState(0)
  const bump = () => setGeneration((g) => g + 1)
  return (
    <>
      <PageHeader title="Настройки" back="/" />
      {profile !== undefined && (
        <ProfileForm key={generation} profile={profile ?? DEFAULT_PROFILE} />
      )}
      <ActiveProgramCard />
      <BackupCard onReplaced={bump} />
      <ResetCard onReplaced={bump} />
    </>
  )
}

/* ----------------------------- Profile ----------------------------- */

function ProfileForm({ profile }: { profile: Profile }) {
  const [values, setValues] = useState<ProfileFormValues>(() => toFormValues(profile))
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setSaved(false)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const res = fromFormValues(values)
    if (res.errors) {
      setErrors(res.errors)
      return
    }
    setErrors({})
    await db.profile.put(res.profile)
    setSaved(true)
  }

  const num = (
    key: keyof ProfileFormValues,
    label: string,
    opts: { step?: string; hint?: string } = {},
  ) => (
    <Field label={label} hint={errors[key] ?? opts.hint}>
      <Input
        type="number"
        inputMode="decimal"
        step={opts.step ?? '1'}
        value={values[key]}
        aria-invalid={errors[key] ? true : undefined}
        className={errors[key] ? 'border-danger!' : ''}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  )

  const select = <T extends string>(
    key: 'sex' | 'activityLevel' | 'goal',
    label: string,
    labels: Record<T, string>,
    className = '',
  ) => (
    <Field label={label} className={className}>
      <Select
        value={values[key]}
        onChange={(e) => set(key, e.target.value as ProfileFormValues[typeof key])}
      >
        {(Object.keys(labels) as T[]).map((k) => (
          <option key={k} value={k}>
            {labels[k]}
          </option>
        ))}
      </Select>
    </Field>
  )

  const name = values.name.trim()
  const hasErrors = Object.keys(errors).length > 0

  return (
    <form onSubmit={save} noValidate>
      <Card variant="elevated" className="flex items-center gap-3.5">
        <span
          aria-hidden
          className="grid size-14 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-accent),var(--color-info))] text-2xl font-bold text-bg shadow-[0_6px_18px_-8px_rgb(180_240_60/0.7)]"
        >
          {name ? name.charAt(0).toUpperCase() : <Icon name="user" size={24} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold tracking-tight">{name || 'Без имени'}</div>
          <div className="truncate text-sm text-muted">
            {GOAL_LABEL_RU[values.goal]}
            {values.weightKg ? ` · ${values.weightKg} кг` : ''}
            {values.heightCm ? ` · ${values.heightCm} см` : ''}
          </div>
        </div>
      </Card>

      <SectionHeader title="Профиль" icon="user" tone="accent" />
      <Card className="space-y-3">
        <Field label="Имя">
          <Input
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            autoComplete="given-name"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {select<Sex>('sex', 'Пол', SEX_RU)}
          {num('birthYear', 'Год рождения')}
        </div>
      </Card>

      <SectionHeader title="Тело" icon="scale" tone="info" />
      <Card className="grid grid-cols-2 gap-3">
        {num('heightCm', 'Рост, см')}
        {num('weightKg', 'Вес, кг', { step: '0.1', hint: 'Последнее взвешивание имеет приоритет' })}
        {num('targetWeightKg', 'Целевой вес, кг', { step: '0.1' })}
      </Card>

      <SectionHeader title="Цели и нормы" icon="target" tone="warn" />
      <Card className="space-y-3">
        {select<ActivityLevel>('activityLevel', 'Активность', ACTIVITY_LEVEL_RU)}
        {select<Goal>('goal', 'Цель', GOAL_LABEL_RU)}
        <div className="grid grid-cols-2 gap-3">
          {num('proteinPerKg', 'Белок, г/кг', { step: '0.1', hint: 'По умолчанию 2,0' })}
          {num('kcalTargetOverride', 'Ккал вручную', { hint: 'Пусто — расчёт автоматически' })}
          {num('waterTargetMl', 'Вода, мл/день', { step: '50' })}
          {num('sleepTargetH', 'Сон, ч/ночь', { step: '0.5' })}
        </div>
      </Card>

      <div className="mt-4 space-y-2">
        <Button type="submit" size="lg" icon="check" className="w-full">
          Сохранить профиль
        </Button>
        {saved && (
          <p
            role="status"
            className="flex items-center justify-center gap-1.5 text-sm font-medium text-accent"
          >
            <Icon name="check" size={16} strokeWidth={2.5} />
            Сохранено
          </p>
        )}
        {hasErrors && (
          <p role="alert" className="flex items-center justify-center gap-1.5 text-sm text-danger">
            <Icon name="info" size={16} />
            Проверьте поля
          </p>
        )}
      </div>
    </form>
  )
}

/* -------------------------- Active program -------------------------- */

function ActiveProgramCard() {
  const programs = useLiveQuery(() => db.programs.toArray(), [])
  const active = useLiveQuery(() => db.settings.get('activeProgramId'), [])
  if (!programs || programs.length === 0) return null
  const value = typeof active?.value === 'string' ? active.value : ''

  return (
    <>
      <SectionHeader title="Тренировки" icon="dumbbell" tone="accent" />
      <Card>
        <Field label="Программа на дашборде «Сегодня»">
          <Select
            value={value}
            onChange={(e) =>
              e.target.value
                ? db.settings.put({ key: 'activeProgramId', value: e.target.value })
                : db.settings.delete('activeProgramId')
            }
          >
            <option value="">Автоматически (первая встроенная)</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
    </>
  )
}

/* ------------------------------ Backup ------------------------------ */

function BackupCard({ onReplaced }: { onReplaced: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ backup: Backup; fileName: string } | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function onExport() {
    setMessage(null)
    const backup = await exportData(db)
    downloadBackup(backup, backupFileName())
    setMessage({ kind: 'ok', text: `Файл ${backupFileName()} сохранён.` })
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMessage(null)
    const res = parseBackup(await file.text())
    if (!res.ok) {
      setMessage({ kind: 'error', text: res.error })
      return
    }
    setPending({ backup: res.backup, fileName: file.name })
  }

  async function confirmImport() {
    if (!pending) return
    setBusy(true)
    try {
      await importData(db, pending.backup)
      onReplaced()
      setMessage({ kind: 'ok', text: 'Данные восстановлены из копии.' })
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Не удалось импортировать.',
      })
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <>
      <SectionHeader title="Данные" icon="history" tone="info" />
      <Card>
        <div className="mb-3 flex items-start gap-3">
          <IconBadge name="info" tone="info" />
          <div className="min-w-0">
            <h3 className="font-semibold tracking-tight">Резервная копия</h3>
            <p className="text-sm text-muted">
              Все данные хранятся только на этом устройстве. Сохраняйте копию в файл и
              восстанавливайте её на другом устройстве.
            </p>
          </div>
        </div>
        <div className="grid gap-2 min-[400px]:grid-cols-2">
          <Button variant="secondary" icon="arrow-down" onClick={onExport}>
            Экспорт в JSON
          </Button>
          <Button variant="secondary" icon="arrow-up" onClick={() => fileRef.current?.click()}>
            Импорт из файла
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Файл резервной копии"
            onChange={onFile}
          />
        </div>
        {message && (
          <p
            role="status"
            className={`mt-3 flex items-start gap-1.5 text-sm ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}
          >
            <Icon name={message.kind === 'ok' ? 'check' : 'info'} size={16} className="mt-0.5" />
            <span>{message.text}</span>
          </p>
        )}

        <Sheet
          open={pending != null}
          onClose={() => !busy && setPending(null)}
          title="Заменить все данные?"
        >
          {pending && (
            <>
              <p className="mb-3 text-sm text-muted">
                Текущие данные на устройстве будут удалены и заменены содержимым файла «
                {pending.fileName}»
                {pending.backup.exportedAt &&
                  ` от ${new Date(pending.backup.exportedAt).toLocaleString('ru-RU')}`}
                .
              </p>
              <ul className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl bg-surface-3/40 p-3 text-sm">
                {summarize(pending.backup).map((s) => (
                  <li key={s.table} className="flex min-w-0 justify-between gap-2">
                    <span className="truncate text-muted">{s.label}</span>
                    <span className="font-medium tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => setPending(null)}
                >
                  Отмена
                </Button>
                <Button
                  variant="danger"
                  icon="arrow-up"
                  className="flex-1"
                  loading={busy}
                  onClick={confirmImport}
                >
                  Заменить всё
                </Button>
              </div>
            </>
          )}
        </Sheet>
      </Card>
    </>
  )
}

/* ------------------------------- Reset ------------------------------ */

function ResetCard({ onReplaced }: { onReplaced: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function reset() {
    setBusy(true)
    try {
      await resetData(db)
      onReplaced()
      setDone(true)
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <>
      <SectionHeader title="Опасная зона" icon="trash" tone="danger" />
      <Card tone="danger" className="border-danger/25">
        <div className="mb-3 flex items-start gap-3">
          <IconBadge name="trash" tone="danger" />
          <div className="min-w-0">
            <h3 className="font-semibold tracking-tight">Сброс</h3>
            <p className="text-sm text-muted">
              Удалит тренировки, питание, сон, вес и всё остальное. Профиль вернётся к значениям по
              умолчанию.
            </p>
          </div>
        </div>
        <Button variant="danger" icon="trash" className="w-full" onClick={() => setOpen(true)}>
          Сбросить данные
        </Button>
        {done && (
          <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-accent">
            <Icon name="check" size={16} />
            Данные сброшены.
          </p>
        )}
        <Sheet open={open} onClose={() => !busy && setOpen(false)} title="Сбросить все данные?">
          <p className="mb-4 text-sm text-muted">
            Действие необратимо. Сначала сделайте экспорт, если данные нужны.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Отмена
            </Button>
            <Button variant="danger" icon="trash" className="flex-1" loading={busy} onClick={reset}>
              Да, удалить всё
            </Button>
          </div>
        </Sheet>
      </Card>
    </>
  )
}
