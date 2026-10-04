import { useRef, useState } from 'react';
import type { Job } from '@qa-radar/shared';
import { STATUS_LABELS, STATUS_ORDER, type JobStatus, type PersonalData, type StatusEntry } from '../lib/storage.ts';
import { formatDate } from '../lib/time.ts';
import { ExternalIcon } from './icons.tsx';

interface Props {
  personal: PersonalData;
  jobsById: Map<string, Job>;
  onUpdate: (jobId: string, patch: Partial<StatusEntry>) => void;
  onClear: (jobId: string) => void;
  onUnhide: (name: string) => void;
  onHide: (name: string) => void;
  onExport: () => void;
  onImport: (json: string) => void;
}

/** "המועמדויות שלי": every job I touched, grouped by status, with notes and application dates. */
export function MineView({ personal, jobsById, onUpdate, onClear, onUnhide, onHide, onExport, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [newHidden, setNewHidden] = useState('');
  const entries = Object.entries(personal.statuses);
  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: entries
      .filter(([, e]) => e.status === status)
      .sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt)),
  })).filter((g) => g.items.length);

  return (
    <div className="space-y-6">
      {!entries.length && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500 dark:border-slate-700">
          עוד לא סימנת משרות. השתמש/י בכוכב או בתפריט הסטטוס בכרטיס משרה.
        </p>
      )}

      {groups.map(({ status, items }) => (
        <section key={status}>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">
            {STATUS_LABELS[status]} · {items.length}
          </h2>
          <ul className="space-y-3">
            {items.map(([id, entry]) => {
              const job = jobsById.get(id);
              const title = job?.title ?? entry.snapshot?.title ?? id;
              const url = job?.url ?? entry.snapshot?.url;
              const company = job ? (job.company ?? job.agency) : entry.snapshot?.company;
              return (
                <li key={id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        <bdi>{title}</bdi>
                      </p>
                      <p className="text-sm text-slate-500">
                        {company && <bdi>{company}</bdi>}
                        {!job && ' · המשרה כבר לא מופיעה במקור'}
                        {job?.state === 'closed' && ' · נסגרה'}
                      </p>
                    </div>
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg p-2 text-brand-700 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-brand-900/50" aria-label="פתח משרה">
                        <ExternalIcon />
                      </a>
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-slate-500">סטטוס</span>
                      <select
                        value={entry.status}
                        onChange={(e) => onUpdate(id, { status: e.target.value as JobStatus })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-slate-500">תאריך הגשה</span>
                      <input
                        type="date"
                        value={entry.appliedAt?.slice(0, 10) ?? ''}
                        onChange={(e) => onUpdate(id, { appliedAt: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : undefined })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="mb-1 block text-xs text-slate-500">הערות</span>
                      <textarea
                        defaultValue={entry.note ?? ''}
                        onBlur={(e) => e.target.value !== (entry.note ?? '') && onUpdate(id, { note: e.target.value || undefined })}
                        rows={2}
                        placeholder="איש קשר, שלב בתהליך, שכר שנאמר…"
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      עודכן {formatDate(entry.updatedAt)}
                      {entry.appliedAt ? ` · הוגש ${formatDate(entry.appliedAt)}` : ''}
                    </span>
                    <button type="button" onClick={() => onClear(id)} className="text-rose-600 hover:underline">
                      הסר
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold">חברות מוסתרות</h2>
        <p className="mb-3 text-xs text-slate-500">משרות שמזכירות את השמות האלה לא יוצגו. נשמר רק בדפדפן הזה.</p>
        <div className="flex flex-wrap gap-2">
          {personal.hiddenCompanies.map((name) => (
            <button key={name} type="button" onClick={() => onUnhide(name)} className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800" aria-label={`הצג שוב את ${name}`}>
              <bdi>{name}</bdi> ✕
            </button>
          ))}
          {!personal.hiddenCompanies.length && <span className="text-sm text-slate-400">אין</span>}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newHidden.trim()) onHide(newHidden.trim());
            setNewHidden('');
          }}
        >
          <input
            value={newHidden}
            onChange={(e) => setNewHidden(e.target.value)}
            placeholder="שם חברה להסתרה"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button type="submit" className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white dark:bg-slate-200 dark:text-slate-900">
            הוסף
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold">גיבוי</h2>
        <p className="mb-3 text-xs text-slate-500">הסטטוסים וההערות נשמרים רק בדפדפן הזה. כדאי לייצא גיבוי מדי פעם (וכדי להעביר לטלפון אחר).</p>
        <div className="flex gap-2">
          <button type="button" onClick={onExport} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">
            ייצוא JSON
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">
            ייבוא JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) onImport(await file.text());
              e.target.value = '';
            }}
          />
        </div>
      </section>
    </div>
  );
}
