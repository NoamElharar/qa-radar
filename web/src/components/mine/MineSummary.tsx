import type { ReactNode } from 'react';
import { OUTCOMES, STALE_DAYS, visiblePipeline, type MineStats } from '../../lib/mine.ts';
import { STATUS_DESCRIPTIONS, STATUS_LABELS, type JobStatus } from '../../lib/storage.ts';
import { ClockIcon } from '../icons.tsx';
import { StatusDot } from './StatusDot.tsx';
import { WeeklyChart } from './WeeklyChart.tsx';

interface Props {
  stats: MineStats;
  total: number;
  selected: JobStatus[];
  staleActive: boolean;
  onToggleStatus: (s: JobStatus) => void;
  onClearStatuses: () => void;
  onToggleStale: () => void;
}

export function Tile({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-3 shadow-card lg:p-5">
      <p className="text-xs text-muted lg:text-sm lg:font-medium lg:text-slate-900 dark:lg:text-slate-100">{label}</p>
      <p className="mt-1 text-3xl leading-none font-semibold tracking-tight tabular-nums lg:mt-2 lg:text-4xl">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted">{sub}</p>}
      {children}
    </div>
  );
}

/** KPI row + weekly chart + the pipeline chips (which double as the status filter and the legend). */
export function MineSummary({
  stats,
  total,
  selected,
  staleActive,
  onToggleStatus,
  onClearStatuses,
  onToggleStale,
}: Props) {
  const delta = stats.appliedThisWeek - stats.appliedLastWeek;
  const pipeline = visiblePipeline(stats.byStatus);
  const pct = Math.round(stats.interviewRate * 100);

  const chip = (s: JobStatus) => {
    const active = selected.includes(s);
    return (
      <button
        key={s}
        type="button"
        aria-pressed={active}
        title={STATUS_DESCRIPTIONS[s]}
        onClick={() => onToggleStatus(s)}
        className={`tap-44 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition ${
          active
            ? 'border-slate-800 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
        }`}
      >
        <StatusDot status={s} />
        {STATUS_LABELS[s]}
        <span className={`tabular-nums ${active ? '' : 'text-muted'}`}>
          {stats.byStatus[s]}
        </span>
      </button>
    );
  };

  return (
    <section aria-label="סיכום" className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Tile
          label="הגשות השבוע"
          value={stats.appliedThisWeek}
          sub={
            delta > 0 ? (
              <span className="text-emerald-700 dark:text-emerald-400">▲ {delta} מהשבוע שעבר</span>
            ) : delta < 0 ? (
              <span className="text-rose-700 dark:text-rose-400">▼ {-delta} מהשבוע שעבר</span>
            ) : (
              'כמו בשבוע שעבר'
            )
          }
        />
        <Tile
          label="זימונים לראיון"
          value={stats.interviews}
          sub={stats.applications ? `${pct}% מתוך ${stats.applications} הגשות` : 'עוד אין הגשות'}
        />
        <button
          type="button"
          onClick={onToggleStale}
          aria-pressed={staleActive}
          className={`rounded-3xl border p-3 text-start transition lg:p-5 ${
            staleActive
              ? 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/50'
              : 'border-line bg-surface shadow-card hover:border-amber-300 dark:hover:border-amber-700'
          }`}
        >
          <span className="block text-xs text-muted lg:text-sm lg:font-medium lg:text-slate-900 dark:lg:text-slate-100">ממתינות לתגובה</span>
          <span className="mt-1 block text-3xl leading-none font-semibold tracking-tight tabular-nums lg:mt-2 lg:text-4xl">{stats.stale}</span>
          <span className="mt-1.5 block text-xs text-muted">
            <ClockIcon className="inline-block align-[-0.125em]" /> {STALE_DAYS}+ ימים ·{' '}
            {staleActive ? 'מסונן ✓' : 'הצג'}
          </span>
        </button>
      </div>

      {stats.applications > 0 && <WeeklyChart weeks={stats.weekly} />}

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="סינון לפי סטטוס"
      >
        <button
          type="button"
          aria-pressed={!selected.length}
          onClick={onClearStatuses}
          className={`tap-44 min-h-9 shrink-0 rounded-full border px-3 text-sm ${
            !selected.length
              ? 'border-brand-700 bg-brand-700 text-white'
              : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
          }`}
        >
          הכל <span className="tabular-nums">{total}</span>
        </button>
        <span
          className="mx-1 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700"
          aria-hidden="true"
        />
        {/* The "‹" leads into each step after the first, so a wrapped line starts with it instead of ending on it. */}
        {pipeline.map((s, i) => (
          <span key={s} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && (
              <span className="text-muted" aria-hidden="true">
                ‹
              </span>
            )}
            {chip(s)}
          </span>
        ))}
        <span
          className="mx-1 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700"
          aria-hidden="true"
        />
        {OUTCOMES.map(chip)}
      </div>
    </section>
  );
}
