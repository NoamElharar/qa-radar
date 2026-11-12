import { useMemo, type ReactNode } from 'react';
import type { Job, SourceHealth } from '@qa-radar/shared';
import { buildItems, STALE_DAYS } from '../lib/mine.ts';
import { bars, greeting, inProcess, IN_PROCESS, waitingForAnswer, weekLabel } from '../lib/overview.ts';
import { collectFacts, computeStats, rate } from '../lib/stats.ts';
import { STATUS_LABELS, type JobStatus, type StatusEntry } from '../lib/storage.ts';
import { relativeTime } from '../lib/time.ts';
import { ArrowDownIcon, ArrowUpIcon, ArrowUpLeftIcon, CheckIcon } from './icons.tsx';
import { StatusDot } from './mine/StatusDot.tsx';

const CHART_WEEKS = 8;
const SHOWN_IN_PROCESS = 3;
const INTERVIEWING: ReadonlySet<JobStatus> = new Set(['interview', 'interview_video', 'interview_frontal', 'awaiting_answer']);

const CARD = 'rounded-3xl border border-line bg-surface p-4 shadow-card lg:p-5';
/** A summary card is a button: it opens the list behind its number. */
const STAT_CARD = `${CARD} block w-full text-start transition-colors duration-150 hover:border-brand-200 dark:hover:border-brand-800`;

/** Faint radar rings in the corner of a blue card (decoration only). */
function Rings() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 size-60">
      <span className="absolute inset-0 rounded-full border border-white/15" />
      <span className="absolute inset-12 rounded-full border border-white/15" />
      <span className="absolute inset-24 rounded-full border border-white/15" />
    </span>
  );
}

export interface OverviewProps {
  now: Date;
  newToday: number;
  newYesterday: number;
  newSinceVisit: number;
  statuses: Record<string, StatusEntry>;
  jobsById: Map<string, Job>;
  sourceById: Map<string, SourceHealth>;
  sources: SourceHealth[];
  boardsTotal: number;
  boardsPending: number;
  /** Opens "שלי", optionally with its filters set (the same query parameters "שלי" writes itself). */
  onOpenMine: (params?: Record<string, string>) => void;
  onOpenStats: () => void;
  onOpenSources: () => void;
  /** Scrolls to a part of this page: today's new jobs, or the boards to check by hand. */
  onJumpTo: (id: 'new-jobs' | 'manual-boards') => void;
}

/** "סקירה": the first thing on the home screen — what is new, what is waiting, what is moving. */
export function Overview({
  now,
  newToday,
  newYesterday,
  newSinceVisit,
  statuses,
  jobsById,
  sourceById,
  sources,
  boardsTotal,
  boardsPending,
  onOpenMine,
  onOpenStats,
  onOpenSources,
  onJumpTo,
}: OverviewProps) {
  const items = useMemo(() => buildItems(statuses, jobsById), [statuses, jobsById]);
  const stats = useMemo(() => computeStats(collectFacts(items, (id) => sourceById.get(id)), now), [items, sourceById, now]);
  const moving = useMemo(() => inProcess(items), [items]);
  const waiting = useMemo(() => waitingForAnswer(items, now), [items, now]);
  const interviewing = moving.filter((i) => INTERVIEWING.has(i.entry.status)).length;
  const replyRate = rate(stats.replied, stats.applications);

  const diff = newToday - newYesterday;
  const news =
    newSinceVisit > 0
      ? newSinceVisit === 1
        ? 'משרה חדשה אחת מאז הביקור הקודם'
        : `${newSinceVisit} משרות חדשות מאז הביקור הקודם`
      : newToday > 0
        ? newToday === 1
          ? 'משרה חדשה אחת היום'
          : `${newToday} משרות חדשות היום`
        : 'עוד אין משרות חדשות היום';
  const process = moving.length ? (moving.length === 1 ? 'מועמדות אחת בתהליך' : `${moving.length} מועמדויות בתהליך`) : '';

  return (
    <section aria-labelledby="overview-title" className="space-y-4 lg:space-y-5">
      <div className="px-1">
        <h2 id="overview-title" className="text-3xl font-semibold tracking-tight lg:text-[2.125rem]">
          {greeting(now)}
        </h2>
        <p className="mt-1 text-muted">
          {news}
          {process && `, ו${/^\d/.test(process) ? '-' : ''}${process}`}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <button
          type="button"
          onClick={() => onJumpTo('new-jobs')}
          className="relative overflow-hidden rounded-3xl bg-brand-700 bg-linear-160 from-brand-600 via-brand-700 to-brand-800 p-4 text-start text-white shadow-[0_18px_36px_-18px_rgb(29_78_137/0.7)] lg:p-5"
        >
          <Rings />
          <span className="relative flex items-start justify-between gap-2">
            <span className="font-medium">חדש היום</span>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-brand-700" aria-hidden="true">
              <ArrowUpLeftIcon />
            </span>
          </span>
          <span className="relative mt-2 block text-4xl leading-none font-semibold tabular-nums lg:text-5xl">{newToday}</span>
          <span className="relative mt-4 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-xs">
            {diff > 0 ? <ArrowUpIcon /> : diff < 0 ? <ArrowDownIcon /> : null}
            {diff > 0 ? `${diff} יותר מאתמול` : diff < 0 ? `${-diff} פחות מאתמול` : 'כמו אתמול'}
          </span>
        </button>

        <StatCard
          label="הוגשו, בלי תשובה"
          value={waiting.total}
          sub={waiting.stale ? `${waiting.stale} מהן ${STALE_DAYS}+ ימים` : waiting.total ? 'כולן מהשבועיים האחרונים' : 'אין הגשות שמחכות'}
          onClick={() => onOpenMine(waiting.stale ? { mf: 'stale' } : { ms: 'applied' })}
        >
          <span aria-hidden="true" className="mt-4 flex h-2.5 gap-1">
            {waiting.total ? (
              <>
                {waiting.total > waiting.stale && (
                  <span className="rounded-full bg-brand-700 dark:bg-brand-500" style={{ flexGrow: waiting.total - waiting.stale }} />
                )}
                {waiting.stale > 0 && <span className="hatch rounded-full text-brand-300 dark:text-brand-800" style={{ flexGrow: waiting.stale }} />}
              </>
            ) : (
              <span className="flex-1 rounded-full bg-slate-100 dark:bg-slate-800" />
            )}
          </span>
        </StatCard>

        <StatCard
          label="בתהליך"
          value={moving.length}
          sub={interviewing ? `${interviewing} בשלב ראיון` : 'שיחות, מטלות וראיונות'}
          onClick={() => onOpenMine({ ms: IN_PROCESS.join(',') })}
        />

        <StatCard
          label="אחוז מענה"
          value={replyRate === undefined ? '—' : `${replyRate}%`}
          sub={stats.applications ? `${stats.replied} ענו מתוך ${stats.applications} הגשות` : 'עוד אין הגשות'}
          onClick={onOpenStats}
        >
          <span aria-hidden="true" className="hatch mt-4 block h-2.5 overflow-hidden rounded-full text-brand-200 dark:text-slate-700">
            <span
              className="block h-full rounded-full bg-brand-700 bg-linear-to-l from-mint-500 to-brand-700"
              style={{ width: `${replyRate ?? 0}%` }}
            />
          </span>
        </StatCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <ActivityCard weeks={stats.weekly.slice(-CHART_WEEKS)} />

        <section aria-labelledby="overview-moving" className={`${CARD} flex flex-col`}>
          <h3 id="overview-moving" className="text-base font-semibold">
            בתהליך עכשיו
          </h3>
          {moving.length ? (
            <ul className="mt-3 space-y-3.5">
              {moving.slice(0, SHOWN_IN_PROCESS).map((item) => (
                <li key={item.id} className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <StatusDot status={item.entry.status} />
                      {STATUS_LABELS[item.entry.status]}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{relativeTime(item.entry.updatedAt, now)}</span>
                  </div>
                  {/* Wrapped, not cut: an English-first title cut short in a right-to-left line loses its start. */}
                  <p className="mt-1.5 font-semibold text-pretty">
                    <bdi>{item.company ?? item.title}</bdi>
                  </p>
                  {item.company && (
                    <p className="line-clamp-2 text-sm text-muted">
                      <bdi>{item.title}</bdi>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">אין כרגע תהליכים פתוחים. שיחה ממגייסת, מטלת בית או ראיון יופיעו כאן.</p>
          )}
          <div className="mt-auto pt-4">
            <button
              type="button"
              onClick={() => onOpenMine(moving.length > SHOWN_IN_PROCESS ? { ms: IN_PROCESS.join(',') } : undefined)}
              className="flex min-h-11 w-full items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {moving.length > SHOWN_IN_PROCESS ? `לכל ה-${moving.length} שבתהליך` : 'לכל המועמדויות'}
            </button>
          </div>
        </section>

        <SourcesCard sources={sources} boardsTotal={boardsTotal} boardsPending={boardsPending} onOpenSources={onOpenSources} onJumpTo={onJumpTo} />
      </div>
    </section>
  );
}

function StatCard({ label, value, sub, onClick, children }: { label: string; value: ReactNode; sub: string; onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={STAT_CARD}>
      <span className="block font-medium">{label}</span>
      <span className="mt-2 block text-4xl leading-none font-semibold tabular-nums lg:text-5xl">{value}</span>
      {children}
      <span className="mt-2 block text-xs text-muted lg:text-[13px]">{sub}</span>
    </button>
  );
}

/** Applications per week as rounded pills; the solid part of each pill is the share that got an answer. */
function ActivityCard({ weeks }: { weeks: Array<{ week: string; applications: number; replied: number }> }) {
  const sized = bars(weeks);
  const max = Math.max(0, ...weeks.map((w) => w.applications));
  const peak = max ? weeks.map((w) => w.applications).lastIndexOf(max) : -1;
  const summary = `הגשות ומענים לפי שבוע: ${weeks.map((w) => `${weekLabel(w.week)}: ${w.applications} הגשות, ${w.replied} ענו`).join('; ')}`;

  return (
    <section aria-labelledby="overview-activity" className={`${CARD} lg:col-span-2 xl:col-span-1`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id="overview-activity" className="text-base font-semibold">
          הגשות ומענים
        </h3>
        <span className="text-sm text-muted">לפי שבוע ההגשה</span>
      </div>
      <ul className="mt-1.5 flex gap-4 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand-200 dark:bg-brand-900" aria-hidden="true" />
          הגשות
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand-700 dark:bg-brand-500" aria-hidden="true" />
          ענו לי
        </li>
      </ul>
      {weeks.length ? (
        <div role="img" aria-label={summary} className="mt-4 flex h-52 items-stretch justify-between gap-2">
          {weeks.map((w, i) => (
            <div key={w.week} className="flex min-w-0 flex-1 flex-col items-center gap-2" title={`${weekLabel(w.week)}: ${w.applications} הגשות, ${w.replied} ענו`}>
              <div className="relative flex w-full flex-1 items-end justify-center">
                {i === peak && (
                  <span className="absolute top-0 z-10 rounded-lg bg-slate-900 px-2 py-0.5 text-xs whitespace-nowrap text-white dark:bg-slate-100 dark:text-slate-900">
                    {w.applications} הגשות, {w.replied} ענו
                  </span>
                )}
                {w.applications > 0 ? (
                  <div
                    className="relative w-full max-w-10 overflow-hidden rounded-full bg-brand-200 dark:bg-brand-900"
                    style={{ height: `max(0.75rem, ${sized[i]!.height * 82}%)` }}
                  >
                    {w.replied > 0 && (
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-full bg-brand-700 dark:bg-brand-500"
                        style={{ height: `max(0.75rem, ${sized[i]!.fill * 100}%)` }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="h-1.5 w-full max-w-10 rounded-full bg-slate-100 dark:bg-slate-800" />
                )}
              </div>
              <span className={`text-xs tabular-nums ${i === peak ? 'font-semibold' : 'text-muted'}`}>{weekLabel(w.week)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-muted dark:border-slate-700">
          עוד אין הגשות. משרה שתסומן "הגשתי" תופיע כאן, לפי השבוע שבו הוגשה.
        </p>
      )}
    </section>
  );
}

function SourcesCard({
  sources,
  boardsTotal,
  boardsPending,
  onOpenSources,
  onJumpTo,
}: Pick<OverviewProps, 'sources' | 'boardsTotal' | 'boardsPending' | 'onOpenSources' | 'onJumpTo'>) {
  const collected = sources.filter((s) => s.status !== 'link-out' && s.status !== 'disabled');
  const failing = collected.filter((s) => s.status === 'error' || s.status === 'suspect');
  const ok = collected.length - failing.length;
  const share = collected.length ? (ok / collected.length) * 100 : 100;

  return (
    <section aria-labelledby="overview-sources" className={`${CARD} flex flex-col`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="overview-sources" className="text-base font-semibold">
          מקורות
        </h3>
        <button type="button" onClick={onOpenSources} className="tap-44 text-sm font-medium text-brand-700 hover:underline dark:text-brand-500">
          לפרטים
        </button>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div
          role="img"
          aria-label={`${ok} מתוך ${collected.length} מקורות תקינים`}
          className="relative size-20 shrink-0 rounded-full"
          style={{ background: `conic-gradient(#2e9e7a 0 ${share}%, #f2b8b8 ${share}% 100%)` }}
        >
          <span dir="ltr" className="absolute inset-2.5 grid place-items-center rounded-full bg-surface text-sm font-semibold tabular-nums">
            {ok}/{collected.length}
          </span>
        </div>
        <p className="text-sm text-muted">מקורות שנאספו כמו שצריך בריצה האחרונה</p>
      </div>
      {failing.length ? (
        // Like the old banner: the failing sources by name, one tap from their details.
        <button
          type="button"
          onClick={onOpenSources}
          className="-mx-2 mt-2 rounded-2xl px-2 py-1.5 text-start transition-colors duration-150 hover:bg-rose-50/70 dark:hover:bg-rose-950/40"
        >
          <span className="block text-sm font-medium text-rose-700 dark:text-rose-300">
            {failing.length === 1 ? 'מקור אחד לא נטען' : `${failing.length} מקורות לא נטענו`}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {failing.map((s) => (
              <span key={s.id} className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                <bdi>{s.name}</bdi>
              </span>
            ))}
          </span>
        </button>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-mint-50 px-2.5 py-0.5 text-xs font-medium text-mint-700 dark:bg-mint-700/30 dark:text-mint-300">
          <CheckIcon /> כל המקורות נטענו
        </p>
      )}
      {boardsTotal > 0 && (
        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={() => onJumpTo('manual-boards')}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-2.5 text-start transition-colors duration-150 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
          >
            <span>
              <span className="block text-sm font-medium">{boardsTotal} אתרים לבדיקה ידנית</span>
              <span className="block text-xs text-muted">{boardsPending ? `${boardsPending} עוד לא נבדקו היום` : 'כולם נבדקו היום'}</span>
            </span>
            <ArrowUpLeftIcon className="shrink-0 text-muted" />
          </button>
        </div>
      )}
    </section>
  );
}

/** The side menu's footer on a desktop: the boards to check by hand, one tap from anywhere. */
export function ManualBoardsCard({ total, pending, onOpen }: { total: number; pending: number; onOpen: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-brand-700 bg-linear-160 from-brand-700 to-brand-800 p-4 text-white">
      <Rings />
      <p className="relative text-2xl leading-tight font-semibold">{total} אתרים</p>
      <p className="relative mt-1 text-sm text-brand-100">
        לבדיקה ידנית: אסור לאסוף מהם אוטומטית. {pending ? `${pending} עוד לא נבדקו היום.` : 'כולם נבדקו היום.'}
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="relative mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-white/30 bg-white/15 text-sm font-medium transition-colors duration-150 hover:bg-white/25"
      >
        פתיחת הרשימה
      </button>
    </div>
  );
}
