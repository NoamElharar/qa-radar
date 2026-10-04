import type { SourceHealth, SourceStatus } from '@qa-radar/shared';
import { SOURCE_TYPE_LABELS } from '@qa-radar/shared';
import { formatDateTime, relativeTime } from '../lib/time.ts';
import { ExternalIcon } from './icons.tsx';

const STATUS_META: Record<SourceStatus, { dot: string; label: string }> = {
  ok: { dot: 'bg-emerald-500', label: 'תקין' },
  suspect: { dot: 'bg-amber-500', label: 'ירידה חשודה' },
  error: { dot: 'bg-rose-600', label: 'נכשל' },
  'link-out': { dot: 'bg-slate-400', label: 'בדיקה ידנית' },
  disabled: { dot: 'bg-slate-300', label: 'כבוי' },
};

/** "מקורות": health of every source, failing ones first. */
export function SourcesView({ sources, generatedAt, now }: { sources: SourceHealth[]; generatedAt: string; now: Date }) {
  const rank: Record<SourceStatus, number> = { error: 0, suspect: 1, ok: 2, 'link-out': 3, disabled: 4 };
  const sorted = [...sources].sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, 'he'));
  const collected = sources.filter((s) => s.status !== 'link-out' && s.status !== 'disabled');
  const failing = collected.filter((s) => s.status === 'error' || s.status === 'suspect');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="מקורות אוטומטיים" value={collected.length} />
        <Stat label="תקינים" value={collected.length - failing.length} tone="ok" />
        <Stat label="בבעיה" value={failing.length} tone={failing.length ? 'bad' : 'ok'} />
      </div>
      <p className="text-xs text-slate-500">ריצה אחרונה: {formatDateTime(generatedAt)} ({relativeTime(generatedAt, now)})</p>
      <ul className="space-y-2">
        {sorted.map((s) => {
          const meta = STATUS_META[s.status];
          return (
            <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <span className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                  {s.name}
                </a>
                <span className="text-xs text-slate-500">
                  {SOURCE_TYPE_LABELS[s.type]} · Tier {s.tier}
                </span>
                <span className="ms-auto text-xs font-medium">{meta.label}</span>
              </div>
              <div className="mt-1 ps-4.5 text-xs text-slate-500">
                {s.status === 'link-out' || s.status === 'disabled' ? (
                  <span>{s.note}</span>
                ) : (
                  <>
                    {s.lastSuccessAt ? `הצלחה אחרונה ${relativeTime(s.lastSuccessAt, now)}` : 'עוד לא הצליח'}
                    {s.fetched !== undefined && ` · ${s.kept ?? 0} משרות QA מתוך ${s.fetched}`}
                    {s.consecutiveFailures > 0 && ` · ${s.consecutiveFailures} כישלונות ברצף`}
                    {!s.baselineDone && ' · ריצת בסיס ראשונה טרם הושלמה'}
                  </>
                )}
              </div>
              {s.error && (s.status === 'error' || s.status === 'suspect') && (
                <p className="mt-1 ps-4.5 text-xs break-words text-rose-700 dark:text-rose-400">
                  <bdi>{s.error}</bdi>
                </p>
              )}
              {s.status === 'link-out' && s.quickLinks?.length ? (
                <div className="mt-2 flex flex-wrap gap-2 ps-4.5">
                  {s.quickLinks.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline dark:text-brand-100">
                      {l.label} <ExternalIcon />
                    </a>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'bad' }) {
  const color = tone === 'bad' ? 'text-rose-600' : tone === 'ok' ? 'text-emerald-600' : '';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
