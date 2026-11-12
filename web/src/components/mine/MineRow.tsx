import { memo } from 'react';
import { textDir } from '../../lib/bidi.ts';
import {
  daysWaiting,
  endClientOf,
  isStale,
  submitterOf,
  type ClientOverlap,
  type MineItem,
} from '../../lib/mine.ts';
import {
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_FORMATS,
  interviewFormatOf,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  ALL_STATUSES,
  LEGACY_STATUSES,
  type InterviewFormat,
  type JobStatus,
  type StatusEntry,
} from '../../lib/storage.ts';
import { formatDate, relativeTime } from '../../lib/time.ts';
import { ExternalIcon, PinIcon } from '../icons.tsx';
import { NotesField } from './NotesField.tsx';
import { StatusDot } from './StatusDot.tsx';

interface Props {
  item: MineItem;
  now: Date;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onTogglePin: (id: string) => void;
  onUpdate: (id: string, patch: Partial<StatusEntry>) => void;
  onRemove: (id: string) => void;
  /** Show the status pill (needed where statuses are mixed, e.g. the pinned section). */
  showStatus: boolean;
  /** Other applications to the same end client, if any. */
  overlap?: ClientOverlap;
  /** Show every application to this end client (sets the search). */
  onShowClient: (client: string) => void;
}

/** How many of the other applications to list before "and N more". */
const OVERLAP_LIST = 5;

/** The other applications to the same company; a warning when someone else sent my CV there too. */
function OverlapNote({
  overlap,
  onShowClient,
}: {
  overlap: ClientOverlap;
  onShowClient: (client: string) => void;
}) {
  const { client, others, conflict } = overlap;
  return (
    <div
      className={`mt-2 rounded-lg border p-2.5 text-xs ${
        conflict
          ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100'
          : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
      }`}
    >
      <p className="font-medium">
        {conflict ? '⚠️ כבר הוגשת ל-' : 'עוד מועמדות ל-'}
        <bdi>{client}</bdi>
        {conflict ? ' גם ממקור אחר:' : ', מאותה חברה:'}
      </p>
      <ul className="mt-1 space-y-0.5">
        {others.slice(0, OVERLAP_LIST).map((o) => (
          <li key={o.id}>
            <bdi>{submitterOf(o) ?? 'לא ידוע מי הגיש'}</bdi> · {STATUS_LABELS[o.entry.status]}
            {o.entry.appliedAt && ` · הוגש ${formatDate(o.entry.appliedAt)}`}
          </li>
        ))}
        {others.length > OVERLAP_LIST && <li>ועוד {others.length - OVERLAP_LIST}</li>}
      </ul>
      {conflict && (
        <p className="mt-1.5">
          חברה שמקבלת את אותם קורות חיים מכמה חברות השמה עלולה לפסול את המועמדות. לפני הגשה נוספת
          — כדאי לברר מי הגיש ראשון.
        </p>
      )}
      <button
        type="button"
        onClick={() => onShowClient(client)}
        className="mt-1 min-h-9 underline"
      >
        הצג את כל המועמדויות ל-<bdi>{client}</bdi>
      </button>
    </div>
  );
}

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900';

/** Title / company / link are editable only for applications added by hand (collected ones come from the source). */
function ManualDetails({
  id,
  entry,
  onUpdate,
}: {
  id: string;
  entry: StatusEntry;
  onUpdate: (id: string, patch: Partial<StatusEntry>) => void;
}) {
  const snapshot = entry.snapshot ?? { title: '', url: '' };
  const save = (patch: Partial<NonNullable<StatusEntry['snapshot']>>) => {
    const next = { ...snapshot, ...patch };
    if (!next.title.trim()) return; // a title is required
    if (
      next.title === snapshot.title &&
      next.company === snapshot.company &&
      next.url === snapshot.url
    )
      return;
    onUpdate(id, { snapshot: next });
  };
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm">
        <span className="mb-1 block text-xs text-slate-500">שם המשרה</span>
        <input
          defaultValue={snapshot.title}
          onBlur={(e) => save({ title: e.target.value.trim() })}
          className={fieldClass}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-slate-500">חברה</span>
        <input
          defaultValue={snapshot.company ?? ''}
          onBlur={(e) => save({ company: e.target.value.trim() || undefined })}
          className={fieldClass}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-slate-500">קישור</span>
        <input
          type="url"
          dir="ltr"
          defaultValue={snapshot.url}
          placeholder="https://"
          onBlur={(e) =>
            save({ url: /^https?:/i.test(e.target.value.trim()) ? e.target.value.trim() : '' })
          }
          className={`${fieldClass} text-start`}
        />
      </label>
    </div>
  );
}

/** One application: two calm lines when collapsed; status, date and notes when expanded. */
export const MineRow = memo(function MineRow({
  item,
  now,
  expanded,
  onToggleExpand,
  onTogglePin,
  onUpdate,
  onRemove,
  showStatus,
  overlap,
  onShowClient,
}: Props) {
  const { id, entry, title, company, url, gone, job } = item;
  const stale = isStale(entry, now);
  const pinned = Boolean(entry.pinned);
  const format = interviewFormatOf(entry);
  const client = endClientOf(item);
  // A direct job already names its company; an agency's ad only hints at it ("ארגון פיננסי").
  const clientHint = job && !job.agency ? job.company : job?.endClient && `במודעה: ${job.endClient}`;

  return (
    <li className={expanded ? 'bg-slate-50/80 dark:bg-slate-800/40' : ''}>
      <div className="flex items-start gap-1 px-2 py-2.5 sm:px-3">
        <button
          type="button"
          onClick={() => onTogglePin(id)}
          aria-pressed={pinned}
          aria-label={pinned ? 'בטל נעיצה' : 'נעץ למעלה'}
          title={pinned ? 'בטל נעיצה' : 'נעץ למעלה'}
          className={`grid size-10 shrink-0 place-items-center rounded-lg text-base ${
            pinned
              ? 'text-brand-700 dark:text-brand-500'
              : 'text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400'
          }`}
        >
          <PinIcon className={pinned ? 'fill-current' : ''} />
        </button>

        <button
          type="button"
          onClick={() => onToggleExpand(id)}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-start"
        >
          <span className="line-clamp-2 leading-snug font-medium">
            <bdi dir={textDir(title)}>{title}</bdi>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            {company && <bdi className="max-w-[12rem] truncate">{company}</bdi>}
            {client && client !== company && (
              <span className="max-w-[12rem] truncate">
                עבור <bdi>{client}</bdi>
              </span>
            )}
            {overlap?.conflict && (
              <span className="rounded-md bg-rose-100 px-1.5 py-px font-medium text-rose-900 dark:bg-rose-900/40 dark:text-rose-100">
                ⚠️ {overlap.others.length + 1} הגשות ל-<bdi>{overlap.client}</bdi>
              </span>
            )}
            {entry.appliedAt && <span>הוגש {formatDate(entry.appliedAt)}</span>}
            <span>עודכן {relativeTime(entry.updatedAt, now)}</span>
            {stale && (
              <span className="rounded-md bg-amber-100 px-1.5 py-px text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                ⏳ {daysWaiting(entry, now)} ימים בלי תגובה
              </span>
            )}
            {entry.manual ? (
              <span className="rounded-md bg-slate-100 px-1.5 py-px text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                ✍️ ידני{entry.channel ? ` · ${entry.channel}` : ''}
              </span>
            ) : (
              entry.channel && <span>דרך {entry.channel}</span>
            )}
            {format !== 'unknown' && (
              <span className="rounded-md bg-teal-50 px-1.5 py-px font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-200">
                ראיון: {INTERVIEW_FORMAT_LABELS[format]}
              </span>
            )}
            {gone && <span className="text-slate-400">· המשרה הוסרה מהמקור</span>}
            {entry.note && <span title={entry.note}>📝 הערה</span>}
          </span>
        </button>

        {showStatus && (
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <StatusDot status={entry.status} className="size-2" />
            {STATUS_LABELS[entry.status]}
          </span>
        )}
      </div>

      {expanded && (
        <div className="space-y-3 px-3 pb-4 ps-11">
          <div role="radiogroup" aria-label="סטטוס" className="flex flex-wrap gap-1.5">
            {/* A legacy status (the unsorted "ראיון") shows only on the entry that still has it. */}
            {ALL_STATUSES.filter((s) => !LEGACY_STATUSES.has(s) || s === entry.status).map((s: JobStatus) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={entry.status === s}
                title={STATUS_DESCRIPTIONS[s]}
                onClick={() =>
                  onUpdate(id, {
                    status: s,
                    appliedAt:
                      s === 'applied' && !entry.appliedAt
                        ? new Date().toISOString()
                        : entry.appliedAt,
                  })
                }
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs ${
                  entry.status === s
                    ? 'border-slate-800 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900'
                    : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                <StatusDot status={s} className="size-2" />
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {entry.manual && <ManualDetails id={id} entry={entry} onUpdate={onUpdate} />}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-slate-500">איפה הגשתי</span>
              <input
                defaultValue={entry.channel ?? ''}
                list="qa-radar-channels"
                placeholder="LinkedIn, AllJobs…"
                onBlur={(e) =>
                  e.target.value.trim() !== (entry.channel ?? '') &&
                  onUpdate(id, { channel: e.target.value.trim() || undefined })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-slate-500">תאריך הגשה</span>
              <input
                type="date"
                value={entry.appliedAt?.slice(0, 10) ?? ''}
                onChange={(e) =>
                  onUpdate(id, {
                    appliedAt: e.target.value
                      ? new Date(`${e.target.value}T12:00:00`).toISOString()
                      : undefined,
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-slate-500">פורמט ראיון</span>
              <select
                value={format}
                onChange={(e) => {
                  const next = e.target.value as InterviewFormat;
                  onUpdate(id, { interviewFormat: next === 'unknown' ? undefined : next });
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              >
                {INTERVIEW_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {INTERVIEW_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="text-sm">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">
                לקוח הקצה — החברה שבה המשרה
              </span>
              <input
                defaultValue={entry.endClient ?? ''}
                list="qa-radar-clients"
                placeholder={clientHint || 'לדוגמה: אקמה'}
                onBlur={(e) =>
                  e.target.value.trim() !== (entry.endClient ?? '') &&
                  onUpdate(id, { endClient: e.target.value.trim() || undefined })
                }
                className={fieldClass}
              />
            </label>
            {overlap && <OverlapNote overlap={overlap} onShowClient={onShowClient} />}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">הערות</span>
            <NotesField
              defaultValue={entry.note ?? ''}
              onBlur={(e) =>
                e.target.value !== (entry.note ?? '') &&
                onUpdate(id, { note: e.target.value || undefined })
              }
              placeholder="איש קשר, שלב בתהליך, שכר שנאמר…"
            />
          </label>

          <div className="flex items-center gap-3 text-sm">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-500"
              >
                פתח משרה <ExternalIcon />
              </a>
            )}
            <button
              type="button"
              onClick={() => window.confirm(`להסיר את "${title}" מהרשימה?`) && onRemove(id)}
              className="ms-auto text-xs text-rose-600 hover:underline"
            >
              הסר מהרשימה
            </button>
          </div>
        </div>
      )}
    </li>
  );
});
