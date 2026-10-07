import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { DEFAULT_PROFILE } from '../../db/seed'
import type { ActivityLevel, Goal, Profile, Sex } from '../../db/types'
import { Button, Card, Field, Input, PageHeader, Select, Sheet } from '../../components/ui'
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
      <div className="space-y-4">
        {profile !== undefined && <ProfileForm key={generation} profile={profile ?? DEFAULT_PROFILE} />}
        <ActiveProgramCard />
        <BackupCard onReplaced={bump} />
        <ResetCard onReplaced={bump} />
      </div>
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

  const num = (key: keyof ProfileFormValues, label: string, opts: { step?: string; hint?: string } = {}) => (
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

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Профиль</h2>
      <form onSubmit={save} className="space-y-3" noValidate>
        <Field label="Имя">
          <Input value={values.name} onChange={(e) => set('name', e.target.value)} autoComplete="given-name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Пол">
            <Select value={values.sex} onChange={(e) => set('sex', e.target.value as Sex)}>
              {(Object.keys(SEX_RU) as Sex[]).map((k) => (
                <option key={k} value={k}>
                  {SEX_RU[k]}
                </option>
              ))}
            </Select>
          </Field>
          {num('birthYear', 'Год рождения')}
          {num('heightCm', 'Рост, см')}
          {num('weightKg', 'Вес, кг', { step: '0.1', hint: 'Последнее взвешивание имеет приоритет' })}
          {num('targetWeightKg', 'Целевой вес, кг', { step: '0.1' })}
          {num('proteinPerKg', 'Белок, г/кг', { step: '0.1', hint: 'По умолчанию 2,0' })}
        </div>
        <Field label="Активность">
          <Select value={values.activityLevel} onChange={(e) => set('activityLevel', e.target.value as ActivityLevel)}>
            {(Object.keys(ACTIVITY_LEVEL_RU) as ActivityLevel[]).map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_LEVEL_RU[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Цель">
          <Select value={values.goal} onChange={(e) => set('goal', e.target.value as Goal)}>
            {(Object.keys(GOAL_LABEL_RU) as Goal[]).map((k) => (
              <option key={k} value={k}>
                {GOAL_LABEL_RU[k]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {num('kcalTargetOverride', 'Ккал вручную', { hint: 'Пусто — расчёт автоматически' })}
          {num('waterTargetMl', 'Вода, мл/день', { step: '50' })}
          {num('sleepTargetH', 'Сон, ч/ночь', { step: '0.5' })}
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit">Сохранить профиль</Button>
          {saved && (
            <span role="status" className="text-sm text-accent">
              Сохранено ✓
            </span>
          )}
          {Object.keys(errors).length > 0 && <span className="text-sm text-danger">Проверьте поля</span>}
        </div>
      </form>
    </Card>
  )
}

/* -------------------------- Active program -------------------------- */

function ActiveProgramCard() {
  const programs = useLiveQuery(() => db.programs.toArray(), [])
  const active = useLiveQuery(() => db.settings.get('activeProgramId'), [])
  if (!programs || programs.length === 0) return null
  const value = typeof active?.value === 'string' ? active.value : ''

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Активная программа</h2>
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
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Не удалось импортировать.' })
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Резервная копия</h2>
      <p className="mb-3 text-sm text-muted">
        Все данные хранятся только на этом устройстве. Сохраняйте копию в файл и восстанавливайте её на другом устройстве.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onExport}>Экспорт в JSON</Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
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
        <p role="status" className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>
          {message.text}
        </p>
      )}

      <Sheet open={pending != null} onClose={() => !busy && setPending(null)} title="Заменить все данные?">
        {pending && (
          <>
            <p className="mb-3 text-sm text-muted">
              Текущие данные на устройстве будут удалены и заменены содержимым файла «{pending.fileName}»
              {pending.backup.exportedAt && ` от ${new Date(pending.backup.exportedAt).toLocaleString('ru-RU')}`}.
            </p>
            <ul className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {summarize(pending.backup).map((s) => (
                <li key={s.table} className="flex justify-between">
                  <span className="text-muted">{s.label}</span>
                  <span>{s.count}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => setPending(null)}>
                Отмена
              </Button>
              <Button variant="danger" className="flex-1" disabled={busy} onClick={confirmImport}>
                Заменить всё
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </Card>
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
    <Card>
      <h2 className="mb-1 font-semibold">Сброс</h2>
      <p className="mb-3 text-sm text-muted">Удалит тренировки, питание, сон, вес и всё остальное. Профиль вернётся к значениям по умолчанию.</p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Сбросить данные
      </Button>
      {done && (
        <p role="status" className="mt-3 text-sm text-accent">
          Данные сброшены.
        </p>
      )}
      <Sheet open={open} onClose={() => !busy && setOpen(false)} title="Сбросить все данные?">
        <p className="mb-4 text-sm text-muted">Действие необратимо. Сначала сделайте экспорт, если данные нужны.</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button variant="danger" className="flex-1" disabled={busy} onClick={reset}>
            Да, удалить всё
          </Button>
        </div>
      </Sheet>
    </Card>
  )
}
