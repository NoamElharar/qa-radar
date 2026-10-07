import { useState } from 'react';
import type { SourceHealth } from '@qa-radar/shared';
import { israelDayKey, relativeTime } from '../lib/time.ts';
import { CheckIcon, ExternalIcon } from './icons.tsx';

interface Props {
  sources: SourceHealth[];
  checks: Record<string, string>;
  now: Date;
  onChecked: (sourceId: string) => void;
}

/** Sources we don't (or may not) collect automatically: one-tap "last 24h" searches + a "בדקתי" button. */
export function QuickLaunch({ sources, checks, now, onChecked }: Props) {
  const today = israelDayKey(now);
  const pending = sources.filter((s) => !checks[s.id] || israelDayKey(checks[s.id]!) !== today).length;
  const [open, setOpen] = useState(pending > 0);

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
        </span>
        <span className="text-slate-400" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {sources.map((s) => {
            const checkedAt = checks[s.id];
            const checkedToday = checkedAt && israelDayKey(checkedAt) === today;
            return (
              <li key={s.id} className={`px-4 py-3 ${checkedToday ? '' : 'bg-amber-50/60 dark:bg-amber-950/20'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{s.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {checkedAt ? `נבדק ${relativeTime(checkedAt, now)}` : 'עוד לא נבדק'}
                      {s.note ? ` · ${s.note}` : ''}
                    </p>
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
