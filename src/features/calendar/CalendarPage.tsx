import { useState, type ChangeEvent, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  IconBadge,
  Input,
  LinkButton,
  PageHeader,
  SectionHeader,
  StaggerList,
} from '../../components/ui'
import { buttonClasses } from '../../components/ui/helpers'
import { Icon, type IconName } from '../../components/icons'
import { db } from '../../db'
import type { CalendarEvent, CalendarFeed } from '../../db/types'
import { plural } from '../../lib/format'
import {
  KIND_META,
  KIND_ORDER,
  actionFor,
  dayHeading,
  groupByDay,
  pastEvents,
  timeRange,
  upcomingEvents,
  type EventKind,
} from './meta'
import {
  CORS_MESSAGE,
  FeedError,
  PAST_DAYS,
  UPCOMING_DAYS,
  deleteFeed,
  deleteSource,
  importIcsText,
  normalizeFeedUrl,
  syncFeed,
  upsertFeed,
  type ImportResult,
} from './store'
import { useNow } from './useNow'
import { WorkoutsNav } from '../../components/WorkoutsNav'

const DAY_MS = 86_400_000

type Notice = { tone: 'ok' | 'error'; text: string } | null

function summaryText({ total, upcoming }: ImportResult): string {
  return `Импортировано ${total} ${plural(total, ['событие', 'события', 'событий'])}, из них ближайших ${upcoming}`
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null
  return notice.tone === 'ok' ? (
    <p role="status" className="mt-3 flex items-start gap-2 rounded-2xl bg-accent/10 px-3 py-2 text-sm text-accent">
      <Icon name="check" size={16} className="mt-0.5 shrink-0" />
      <span>{notice.text}</span>
    </p>
  ) : (
    <p role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger">
      <Icon name="info" size={16} className="mt-0.5 shrink-0" />
      <span>{notice.text}</span>
    </p>
  )
}

function CardHead({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <IconBadge name={icon} tone="info" />
      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] leading-tight font-semibold tracking-tight">{title}</h2>
        {children && <p className="mt-1 text-sm text-muted">{children}</p>}
      </div>
    </div>
  )
}

export function CalendarPage() {
  const now = useNow()
  const minuteKey = Math.floor(now.getTime() / 60_000)
  const [kind, setKind] = useState<EventKind | 'all'>('all')
  const [importNotice, setImportNotice] = useState<Notice>(null)
  const [feedNotice, setFeedNotice] = useState<Notice>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const windowEvents = useLiveQuery(() => {
    const t = minuteKey * 60_000
    return db.calendarEvents
      .where('startAt')
      .between(
        new Date(t - (PAST_DAYS + 1) * DAY_MS).toISOString(),
        new Date(t + UPCOMING_DAYS * DAY_MS).toISOString(),
      )
      .toArray()
  }, [minuteKey])
  const sourceKeys = useLiveQuery(() => db.calendarEvents.orderBy('source').keys(), [])
  const feeds = useLiveQuery(() => db.calendarFeeds.toArray(), [])

  const sources = new Map<string, number>()
  for (const key of sourceKeys ?? []) sources.set(String(key), (sources.get(String(key)) ?? 0) + 1)
  const feedLabels = new Set((feeds ?? []).map((f) => f.label))

  const filtered = (windowEvents ?? []).filter((e) => kind === 'all' || e.kind === kind)
  const upcoming = upcomingEvents(filtered, now, UPCOMING_DAYS)
  const past = pastEvents(filtered, now, PAST_DAYS)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget
    const files = [...(input.files ?? [])]
    if (files.length === 0) return
    setBusy(true)
    try {
      const totals: ImportResult = { total: 0, upcoming: 0 }
      for (const file of files) {
        const r = await importIcsText(await readFileText(file), file.name)
        totals.total += r.total
        totals.upcoming += r.upcoming
      }
      setImportNotice({ tone: 'ok', text: summaryText(totals) })
    } catch (err) {
      setImportNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Не удалось прочитать файл',
      })
    } finally {
      setBusy(false)
      input.value = ''
    }
  }

  async function runSync(feed: CalendarFeed) {
    setBusy(true)
    try {
      setFeedNotice({ tone: 'ok', text: summaryText(await syncFeed(feed)) })
    } catch (err) {
      setFeedNotice({ tone: 'error', text: err instanceof FeedError ? err.message : CORS_MESSAGE })
    } finally {
      setBusy(false)
    }
  }

  async function onSubscribe() {
    const normalized = normalizeFeedUrl(url)
    if (!normalized) {
      setFeedNotice({ tone: 'error', text: 'Введите ссылку вида https://… или webcal://…' })
      return
    }
    const feed = await upsertFeed(normalized)
    setUrl('')
    await runSync(feed)
  }

  const hasAny = (sourceKeys?.length ?? 0) > 0

  return (
    <>
      <PageHeader title="Календарь" subtitle="Записи OneFit из Google / Apple Calendar" />
      <WorkoutsNav />

      <div className="space-y-3">
        <Card tone="info">
          <CardHead icon="arrow-down" title="Импорт файла">
            OneFit добавляет каждую запись в календарь телефона. Загрузите календарь сюда — FORMA
            покажет ближайшие занятия и предложит начать тренировку.
          </CardHead>
          <label
            className={buttonClasses({
              variant: 'primary',
              className: `mt-4 w-full cursor-pointer focus-within:ring-2 focus-within:ring-accent/50 ${
                busy ? 'pointer-events-none opacity-50' : ''
              }`,
            })}
          >
            <Icon name="plus" size={18} />
            <input
              type="file"
              accept=".ics,text/calendar"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={onFile}
            />
            Импортировать .ics
          </label>
          <NoticeLine notice={importNotice} />
        </Card>

        <Card>
          <CardHead icon="history" title="Подписка по ссылке" />
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void onSubscribe()
            }}
          >
            <Field
              label="Секретный адрес календаря в формате iCal"
              hint="Google Calendar обычно не отдаёт данные браузеру напрямую (CORS) — это ожидаемо. Тогда скачайте .ics и импортируйте файлом. Ссылки других сервисов могут работать."
            >
              <Input
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="secondary" icon="history" disabled={busy || !url.trim()}>
              Синхронизировать
            </Button>
          </form>
          <NoticeLine notice={feedNotice} />
          {feeds && feeds.length > 0 && (
            <ul className="mt-4 space-y-2">
              {feeds.map((f) => (
                <FeedRow
                  key={f.id}
                  feed={f}
                  count={sources.get(f.label) ?? 0}
                  busy={busy}
                  onSync={() => void runSync(f)}
                />
              ))}
            </ul>
          )}
        </Card>

        <Instructions />

        {[...sources.entries()].some(([s]) => !feedLabels.has(s)) && (
          <Card>
            <CardHead icon="list" title="Импортированные файлы" />
            <ul className="mt-3 space-y-2">
              {[...sources.entries()]
                .filter(([s]) => !feedLabels.has(s))
                .map(([source, count]) => (
                  <SourceRow key={source} source={source} count={count} />
                ))}
            </ul>
          </Card>
        )}

        {hasAny ? (
          <>
            <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label="Фильтр по типу">
              <Chip tone="info" active={kind === 'all'} onClick={() => setKind('all')}>
                Все
              </Chip>
              {KIND_ORDER.map((k) => (
                <Chip
                  key={k}
                  tone={KIND_META[k].tone}
                  icon={KIND_META[k].icon}
                  active={kind === k}
                  onClick={() => setKind(k)}
                >
                  {KIND_META[k].label}
                </Chip>
              ))}
            </div>

            <EventSection
              icon="calendar"
              title="Ближайшие"
              subtitle={`${UPCOMING_DAYS} дней`}
              events={upcoming}
              now={now}
              empty="Ближайших занятий нет"
            />
            <EventSection
              icon="history"
              title="Прошедшие"
              subtitle={`${PAST_DAYS} дней`}
              events={past}
              now={now}
              empty="За последнюю неделю событий нет"
            />
          </>
        ) : (
          sourceKeys !== undefined && (
            <EmptyState
              icon="calendar"
              tone="info"
              title="Событий пока нет"
              hint="Импортируйте .ics или добавьте ссылку на календарь, куда OneFit пишет записи."
            />
          )
        )}
      </div>
    </>
  )
}

function EventSection({
  icon,
  title,
  subtitle,
  events,
  now,
  empty,
}: {
  icon: IconName
  title: string
  subtitle: string
  events: CalendarEvent[]
  now: Date
  empty: string
}) {
  return (
    <section aria-label={title}>
      <SectionHeader title={title} subtitle={subtitle} icon={icon} tone="info" className="mt-4" />
      {events.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-surface/40 p-4 text-center text-sm text-muted">
          <Icon name={icon} size={16} className="shrink-0 text-info/70" />
          {empty}
        </p>
      ) : (
        <div className="space-y-4">
          {groupByDay(events).map(([day, list]) => (
            <div key={day}>
              <h3 className="mb-2 px-0.5 text-xs font-medium tracking-wide text-muted uppercase">
                {dayHeading(day, now)}
              </h3>
              <StaggerList as="ul" className="space-y-2">
                {list.map((ev) => (
                  <EventRow key={ev.id} ev={ev} />
                ))}
              </StaggerList>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function EventRow({ ev }: { ev: CalendarEvent }) {
  const action = actionFor(ev.kind)
  const meta = KIND_META[ev.kind]
  return (
    <Card as="div" className="flex items-start gap-3 p-3.5">
      <IconBadge name={meta.icon} tone={meta.tone} />
      <span className="sr-only">{meta.label}</span>
      <div className="min-w-0 flex-1">
        <p className="leading-snug font-semibold tracking-tight break-words">{ev.title}</p>
        <p className="mt-0.5 text-sm text-muted">
          <span className="font-medium text-text tabular-nums">{timeRange(ev)}</span>
          {ev.location && <> · {ev.location}</>}
        </p>
        {action && (
          <LinkButton
            to={action.to}
            variant="secondary"
            size="sm"
            icon={ev.kind === 'gym' ? 'play' : 'plus'}
            className="mt-2.5"
          >
            {action.label}
          </LinkButton>
        )}
      </div>
    </Card>
  )
}

function ConfirmDelete({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button variant="ghost" size="sm" icon="trash" onClick={() => setAsking(true)}>
        {label}
      </Button>
    )
  }
  return (
    <span className="flex items-center gap-1">
      <Button variant="danger" size="sm" onClick={onConfirm}>
        Да, удалить
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
        Отмена
      </Button>
    </span>
  )
}

function SourceRow({ source, count }: { source: string; count: number }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 py-2 pr-1.5 pl-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{source}</p>
        <p className="text-xs text-muted">
          {count} {plural(count, ['событие', 'события', 'событий'])}
        </p>
      </div>
      <ConfirmDelete label="Удалить события" onConfirm={() => void deleteSource(source)} />
    </li>
  )
}

function FeedRow({
  feed,
  count,
  busy,
  onSync,
}: {
  feed: CalendarFeed
  count: number
  busy: boolean
  onSync: () => void
}) {
  return (
    <li className="rounded-2xl bg-surface-2 px-3 py-2.5">
      <p className="truncate text-sm font-medium">{feed.label}</p>
      <p className="text-xs text-muted">
        {count} {plural(count, ['событие', 'события', 'событий'])}
        {feed.lastSyncAt &&
          ` · обновлено ${format(parseISO(feed.lastSyncAt), 'd MMM, HH:mm', { locale: ru }).replace('.', '')}`}
      </p>
      {feed.lastError && <p className="mt-1 text-xs text-danger">{feed.lastError}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon="history" disabled={busy} onClick={onSync}>
          Обновить
        </Button>
        <ConfirmDelete label="Удалить" onConfirm={() => void deleteFeed(feed)} />
      </div>
    </li>
  )
}

function Instructions() {
  return (
    <details className="group rounded-3xl border border-white/[0.06] bg-surface bg-[image:var(--gradient-surface)] p-4 shadow-[var(--shadow-card)]">
      <summary className="cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3">
          <IconBadge name="info" tone="info" />
          <span className="min-w-0 flex-1 text-[17px] font-semibold tracking-tight">Как получить календарь (.ics)</span>
          <Icon
            name="chevron-down"
            size={20}
            className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="mt-3 space-y-4 text-sm text-muted">
        <p>
          Сначала убедитесь, что записи OneFit попадают в календарь телефона (Google или Apple) —
          FORMA читает именно его.
        </p>
        <div>
          <h3 className="mb-1 font-medium text-text">Google Calendar</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Откройте calendar.google.com на компьютере → Настройки.</li>
            <li>
              Слева в «Настройках моих календарей» выберите календарь, куда приходят записи OneFit.
            </li>
            <li>
              Раздел «Интеграция календаря» → «Секретный адрес в формате iCal» — скопируйте и
              вставьте в поле подписки выше.
            </li>
            <li>
              Если синхронизация пишет про CORS (для Google это обычно): Настройки → «Импорт и
              экспорт» → «Экспорт». Скачается .zip — распакуйте его и импортируйте нужный .ics
              кнопкой «Импортировать .ics».
            </li>
          </ol>
        </div>
        <div>
          <h3 className="mb-1 font-medium text-text">Apple Calendar</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>На Mac откройте «Календарь» и выберите нужный календарь в списке слева.</li>
            <li>Файл → Экспорт → Экспорт… — сохраните файл .ics.</li>
            <li>Импортируйте файл кнопкой «Импортировать .ics».</li>
          </ol>
          <p className="mt-1">
            С iPhone: в настройках календаря на iCloud.com можно включить «Публичный календарь» и
            вставить ссылку (webcal://…) в поле подписки.
          </p>
        </div>
        <p>Повторный импорт того же файла не создаёт дублей — события обновляются.</p>
      </div>
    </details>
  )
}
