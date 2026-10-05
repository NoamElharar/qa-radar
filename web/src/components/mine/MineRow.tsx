import { memo } from 'react';
import { textDir } from '../../lib/bidi.ts';
import { daysWaiting, isStale, type MineItem } from '../../lib/mine.ts';
import {
  STATUS_LABELS,
  STATUS_ORDER,
  type JobStatus,
  type StatusEntry,
} from '../../lib/storage.ts';
import { formatDate, relativeTime } from '../../lib/time.ts';
import { ExternalIcon, PinIcon } from '../icons.tsx';
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
}: Props) {
  const { id, entry, title, company, url, gone } = item;
  const stale = isStale(entry, now);
  const pinned = Boolean(entry.pinned);

  return (
    <li className={expanded ? 'bg-slate-50/80 dark:bg-slate-800/40' : ''}>
      <div className="flex items-start gap-1 px-2 py-2.5 sm:px-3">
        <button
          type="button"
          onClick={() => onTogglePin(id)}
          aria-pressed={pinned}
          aria-label={pinned ? 'בטל נעיצה' : 'נעץ למעלה'}
          title={pinned ? 'בטל נעיצה' : 'נעץ למעלה'}
          className={`mt-0.5 shrink-0 rounded-lg p-1.5 text-base ${
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
            {entry.appliedAt && <span>הוגש {formatDate(entry.appliedAt)}</span>}
            <span>עודכן {relativeTime(entry.updatedAt, now)}</span>
            {stale && (
              <span className="rounded-md bg-amber-100 px-1.5 py-px text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                ⏳ {daysWaiting(entry, now)} ימים בלי תגובה
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
            {STATUS_ORDER.map((s: JobStatus) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={entry.status === s}
                onClick={() =>
                  onUpdate(id, {
                    status: s,
                    appliedAt:
                      s === 'applied' && !entry.appliedAt
                        ? new Date().toISOString()
                        : entry.appliedAt,
                  })
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
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

          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
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
              <span className="mb-1 block text-xs text-slate-500">הערות</span>
              <textarea
                defaultValue={entry.note ?? ''}
                onBlur={(e) =>
                  e.target.value !== (entry.note ?? '') &&
                  onUpdate(id, { note: e.target.value || undefined })
                }
                rows={2}
                placeholder="איש קשר, שלב בתהליך, שכר שנאמר…"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>

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
