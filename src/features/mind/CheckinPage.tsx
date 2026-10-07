import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  Button,
  Card,
  Chip,
  Field,
  IconBadge,
  Input,
  PageHeader,
  SegmentedControl,
  Skeleton,
} from '../../components/ui'
import { useReduceMotion } from '../../components/ui/helpers'
import { db } from '../../db'
import type { ISODate, MoodEntry } from '../../db/types'
import { today } from '../../lib/dates'
import {
  DEFAULT_TAGS,
  defaultSlot,
  isSlot,
  MOOD_LABEL,
  moodEntryId,
  normalizeTag,
  SLOT_LABEL,
  type MoodValue,
  type Slot,
} from './calc'
import { AutoTextarea, DotScale, MoodPicker } from './parts'

type Scale = 1 | 2 | 3 | 4 | 5

/** Mood check-in for a slot of a day: one per `[date+slot]`, opening it again edits it. */
export function CheckinPage() {
  const [params, setParams] = useSearchParams()
  const slotParam = params.get('slot')
  const slot: Slot = isSlot(slotParam) ? slotParam : defaultSlot()
  const dateParam = params.get('date')
  const date: ISODate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today()

  const query = useLiveQuery(
    async () => ({ key: `${date}-${slot}`, entry: (await db.moods.where('[date+slot]').equals([date, slot]).first()) ?? null }),
    [date, slot],
  )
  // While the query for a newly chosen slot is in flight the hook still returns the old result.
  const existing = query && query.key === `${date}-${slot}` ? query.entry : undefined
  // Tags the user invented before, so they can be reused with one tap.
  const knownTags = useLiveQuery(async () => {
    const all = await db.moods.toArray()
    const custom = new Set<string>()
    for (const m of all) for (const t of m.tags ?? []) if (!DEFAULT_TAGS.includes(t)) custom.add(t)
    return [...custom].sort((a, b) => a.localeCompare(b))
  }, [])

  return (
    <>
      <PageHeader
        title={`Чек-ин · ${SLOT_LABEL[slot]}`}
        subtitle={existing ? 'Уже отмечено — можно изменить' : 'Как вы сейчас?'}
        back="/mind"
      />
      <SegmentedControl
        aria-label="Время дня"
        className="mb-4"
        value={slot}
        onChange={(s) => {
          const next = new URLSearchParams(params)
          next.set('slot', s)
          setParams(next, { replace: true })
        }}
        options={[
          { value: 'morning', label: SLOT_LABEL.morning, icon: 'sun' },
          { value: 'evening', label: SLOT_LABEL.evening, icon: 'moon' },
        ]}
      />
      {existing === undefined ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-32" rounded="rounded-3xl" />
          <Skeleton className="h-40" rounded="rounded-3xl" />
        </div>
      ) : (
        <CheckinForm key={`${date}-${slot}`} date={date} slot={slot} existing={existing} knownTags={knownTags ?? []} />
      )}
    </>
  )
}

function CheckinForm({
  date,
  slot,
  existing,
  knownTags,
}: {
  date: ISODate
  slot: Slot
  existing: MoodEntry | null
  knownTags: string[]
}) {
  const navigate = useNavigate()
  const [mood, setMood] = useState<MoodValue | null>(existing?.mood ?? null)
  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null)
  const [stress, setStress] = useState<number | null>(existing?.stress ?? null)
  const [tags, setTags] = useState<string[]>(existing?.tags ?? [])
  const [newTag, setNewTag] = useState('')
  const [note, setNote] = useState(existing?.note ?? '')
  const [saving, setSaving] = useState(false)

  const tagOptions = [...new Set([...DEFAULT_TAGS, ...knownTags, ...tags])]

  function toggleTag(t: string) {
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  }

  function addTag() {
    const t = normalizeTag(newTag)
    if (t && !tags.includes(t)) setTags((cur) => [...cur, t])
    setNewTag('')
  }

  async function save() {
    if (mood == null) return
    setSaving(true)
    const entry: MoodEntry = {
      id: existing?.id ?? moodEntryId(date, slot),
      date,
      slot,
      mood,
      ...(energy != null ? { energy: energy as Scale } : {}),
      ...(stress != null ? { stress: stress as Scale } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    await db.moods.put(entry)
    navigate('/mind')
  }

  return (
    <div className="space-y-3">
      <Card variant="elevated" tone="violet">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <IconBadge name="heart" tone="violet" size="sm" />
            Настроение
          </h2>
          <MoodLabel mood={mood} />
        </div>
        <MoodPicker value={mood} onChange={setMood} />
      </Card>

      <Card className="space-y-4">
        <DotScale label="Энергия" tone="info" value={energy} onChange={setEnergy} low="нет сил" high="бодрость" />
        <DotScale label="Стресс" tone="warn" value={stress} onChange={setStress} low="спокойно" high="напряжённо" />
      </Card>

      <Card>
        <h2 className="mb-2.5 flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <IconBadge name="sparkles" tone="violet" size="sm" />
          Что влияет
        </h2>
        <div className="flex flex-wrap gap-2">
          {tagOptions.map((t) => (
            <Chip key={t} tone="violet" icon={tags.includes(t) ? 'check' : undefined} active={tags.includes(t)} onClick={() => toggleTag(t)}>
              {t}
            </Chip>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addTag()
          }}
        >
          <Input aria-label="Свой тег" placeholder="Свой тег" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
          <Button type="submit" variant="secondary" icon="plus" className="shrink-0" disabled={!newTag.trim()}>
            Добавить
          </Button>
        </form>
      </Card>

      <Card>
        <Field label="Заметка">
          <AutoTextarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Пара слов о том, что происходит" />
        </Field>
      </Card>

      <Button size="lg" icon="check" className="w-full" disabled={mood == null || saving} onClick={() => void save()}>
        {existing ? 'Сохранить изменения' : 'Сохранить'}
      </Button>
      {mood == null && <p className="text-center text-xs text-muted">Выберите настроение, чтобы сохранить</p>}
    </div>
  )
}

/** Name of the chosen mood; crossfades with a small slide when it changes. */
function MoodLabel({ mood }: { mood: MoodValue | null }) {
  const reduce = useReduceMotion()
  const text = mood ? MOOD_LABEL[mood - 1] : ''
  if (reduce) return <span className="text-sm font-semibold text-violet">{text}</span>
  return (
    <span className="relative grid h-5 min-w-24 justify-items-end overflow-hidden text-sm font-semibold text-violet">
      <AnimatePresence initial={false}>
        <motion.span
          key={text}
          className="col-start-1 row-start-1"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
