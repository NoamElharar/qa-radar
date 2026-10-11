import { useState } from 'react';
import type { SourceHealth } from '@qa-radar/shared';
import { israelDayKey, relativeTime } from '../lib/time.ts';
import { watchStatus, type WatchStatus } from '../lib/watch.ts';
import { CheckIcon, ExternalIcon } from './icons.tsx';

interface Props {
  sources: SourceHealth[];
  checks: Record<string, string>;
  now: Date;
  onChecked: (sourceId: string) => void;
}

/** "3 משרות QA כרגע · התאמה עד 84" — the count line of a watch-mode source. */
function watchLine(w: WatchStatus): string {
  if (!w.count) return 'אין כרגע משרות QA';
  const count = w.count === 1 ? 'משרת QA אחת כרגע' : `${w.count} משרות QA כרגע`;
  return w.best !== undefined ? `${count} · התאמה עד ${w.best}` : count;
}

/**
 * Sources we don't (or may not) collect automatically: one-tap searches + a "בדקתי" button. Sources
 * in watch mode also show how many QA jobs they list and how many are new since the last check.
 */
export function QuickLaunch({ sources, checks, now, onChecked }: Props) {
  const today = israelDayKey(now);
  const pending = sources.filter((s) => !checks[s.id] || israelDayKey(checks[s.id]!) !== today).length;
  const watched = new Map(sources.map((s) => [s.id, watchStatus(s, checks[s.id])]));
  const fresh = [...watched.values()].reduce((n, w) => n + (w?.fresh ?? 0), 0);
  // Sources with something new first; otherwise keep the registry order.
  const ordered = [...sources].sort((a, b) => (watched.get(b.id)?.fresh ? 1 : 0) - (watched.get(a.id)?.fresh ? 1 : 0));
  const [open, setOpen] = useState(pending > 0 || fresh > 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-start"
        aria-expanded={open}
      >
        <span className="font-semibold">
          לוחות חיצוניים — בדיקה ידנית
          <span className="ms-2 text-sm font-normal text-slate-500">
            {pending ? `${pending} לא נבדקו היום` : 'הכל נבדק היום ✓'}
          </span>
          {fresh > 0 && (
            <span className="ms-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">
              {fresh === 1 ? 'משרה חדשה' : `${fresh} משרות חדשות`}
            </span>
          )}
        </span>
        <span className="text-slate-400" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {ordered.map((s) => {
            const checkedAt = checks[s.id];
            const checkedToday = checkedAt && israelDayKey(checkedAt) === today;
            const w = watched.get(s.id);
            return (
              <li key={s.id} className={`px-4 py-3 ${checkedToday ? '' : 'bg-amber-50/60 dark:bg-amber-950/20'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{s.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {checkedAt ? `נבדק ${relativeTime(checkedAt, now)}` : 'עוד לא נבדק'}
                      {s.note ? ` · ${s.note}` : ''}
                    </p>
                    {w && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700 dark:text-slate-200">
                        <span>{watchLine(w)}</span>
                        {w.fresh > 0 && (
                          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">
                            {w.fresh === 1 ? 'אחת חדשה מאז שבדקת' : `${w.fresh} חדשות מאז שבדקת`}
                          </span>
                        )}
                      </p>
                    )}
                    {s.watch && s.error && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">⚠ הספירה האוטומטית נכשלה בבדיקה האחרונה</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onChecked(s.id)}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border px-3 text-xs ${
                      checkedToday
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    <CheckIcon /> בדקתי
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(s.quickLinks ?? [{ label: 'פתח', url: s.homepage }]).map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-brand-50 px-3 text-sm font-medium text-brand-800 hover:bg-brand-100 dark:bg-brand-900/50 dark:text-brand-100"
                    >
                      {l.label} <ExternalIcon />
                    </a>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
