import { useEffect, useRef, useState } from 'react';
import { BADGE_LABELS, badgeFor, REGION_LABELS, SENIORITY_LABELS, type Badge, type Job } from '@qa-radar/shared';
import { STATUS_LABELS, STATUS_ORDER, type JobStatus, type StatusEntry } from '../lib/storage.ts';
import { textDir } from '../lib/bidi.ts';
import { formatDate, relativeTime } from '../lib/time.ts';
import { CheckIcon, DotsIcon, ExternalIcon, PinIcon, StarIcon } from './icons.tsx';

const BADGE_STYLES: Record<Badge, string> = {
  new: 'bg-rose-600 text-white',
  fresh: 'bg-amber-400 text-amber-950',
  back: 'bg-violet-600 text-white',
  closed: 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};


const MAX_TAGS = 5;

function scoreStyle(score: number): string {
  if (score >= 70) return 'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800';
  if (score >= 40) return 'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800';
  return 'bg-slate-100 text-slate-600 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
}

export interface JobCardProps {
  job: Job;
  sourceName: string;
  status?: StatusEntry;
  highlight: boolean;
  now: Date;
  onStatus: (job: Job, status: JobStatus | undefined) => void;
  onOpen: (job: Job) => void;
  onHideCompany: (name: string) => void;
}

export function JobCard({ job, sourceName, status, highlight, now, onStatus, onOpen, onHideCompany }: JobCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const badge = badgeFor(job, now);
  const saved = status?.status === 'saved';
  const companyName = job.company ?? job.agency;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  const regionChips = job.regions.map((r) => REGION_LABELS[r]);

  return (
    <article
      className={`relative rounded-2xl border bg-white p-4 shadow-sm transition dark:bg-slate-900 ${
        highlight ? 'border-rose-300 ring-1 ring-rose-200 dark:border-rose-800 dark:ring-rose-900' : 'border-slate-200 dark:border-slate-800'
      } ${job.state === 'closed' ? 'opacity-60' : ''}`}
      aria-labelledby={`job-${job.id}`}
    >
      {highlight && <span className="absolute inset-y-3 start-0 w-1 rounded-e bg-rose-500" aria-hidden="true" />}

      {/* Row 1: badge · title · score */}
      <div className="flex items-start gap-2">
        {badge && (
          <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_STYLES[badge]}`}>
            {BADGE_LABELS[badge]}
          </span>
        )}
        <h3 id={`job-${job.id}`} className="min-w-0 flex-1 text-base leading-snug font-semibold">
          <bdi dir={textDir(job.title)}>{job.title}</bdi>
        </h3>
        <span
          className={`shrink-0 rounded-lg px-2 py-0.5 text-sm font-bold tabular-nums ring-1 ${scoreStyle(job.score)}`}
          title="ציון התאמה לפרופיל"
        >
          {job.score}
        </span>
      </div>

      {/* Row 2: company / agency + end client */}
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {job.agency ? (
          <>
            דרך <bdi className="font-medium">{job.agency}</bdi>
            {job.endClient && (
              <>
                {' · '}לקוח: <bdi>{job.endClient}</bdi>
              </>
            )}
          </>
        ) : (
          <bdi className="font-medium">{job.company}</bdi>
        )}
      </p>

      {/* Row 3: location · distance · first seen */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <PinIcon className="text-slate-400" />
          {job.city ?? (regionChips.length ? '' : 'מיקום לא צוין')}
          {regionChips.map((r) => (
            <span key={r} className="rounded-full bg-brand-50 px-1.5 py-px text-brand-800 dark:bg-brand-900/60 dark:text-brand-100">
              {r}
            </span>
          ))}
        </span>
        {job.distanceKm !== undefined && <span>{job.distanceKm} ק״מ מהבית</span>}
        <span title={`נראתה לראשונה ${formatDate(job.firstSeenAt)}`}>נראתה {relativeTime(job.firstSeenAt, now)}</span>
        {job.postedAt && <span>פורסמה {formatDate(job.postedAt)}</span>}
      </div>

      {/* Row 4: tags + seniority */}
      {(job.tags.length > 0 || job.seniority !== 'unknown') && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {job.seniority !== 'unknown' && (
            <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
              {SENIORITY_LABELS[job.seniority]}
              {job.yearsRequired ? ` · ${job.yearsRequired}+ שנים` : ''}
            </span>
          )}
          {(expanded ? job.tags : job.tags.slice(0, MAX_TAGS)).map((t) => (
            <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {t}
            </span>
          ))}
          {!expanded && job.tags.length > MAX_TAGS && (
            <span className="px-1 py-0.5 text-xs text-slate-500">+{job.tags.length - MAX_TAGS}</span>
          )}
        </div>
      )}

      {/* Row 5: ✓ / ✗ details */}
      {expanded && (
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          {job.matched.length > 0 && (
            <p>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">✓ יש לי: </span>
              {job.matched.join(' · ')}
            </p>
          )}
          {job.missing.length > 0 && (
            <p>
              <span className="font-semibold text-rose-700 dark:text-rose-400">✗ חסר: </span>
              {job.missing.join(' · ')}
            </p>
          )}
          {!job.matched.length && !job.missing.length && <p className="text-slate-500">לא זוהו כישורים בתיאור המשרה.</p>}
          {job.snippet && (
            <p className="text-slate-600 dark:text-slate-300">
              <bdi>{job.snippet}</bdi>
            </p>
          )}
          <p className="text-xs text-slate-500">
            מקור: {sourceName}
            {job.locationText ? ` · מיקום במקור: ${job.locationText}` : ''}
          </p>
        </div>
      )}

      {/* Row 6: actions */}
      <div className="mt-3 flex items-center gap-2">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onOpen(job)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 active:scale-[.98]"
        >
          הגש מועמדות <ExternalIcon />
        </a>
        <button
          type="button"
          onClick={() => onStatus(job, saved ? undefined : 'saved')}
          className={`inline-flex size-11 items-center justify-center rounded-xl border text-lg ${saved ? 'border-amber-300 bg-amber-50 text-amber-500 dark:border-amber-700 dark:bg-amber-950' : 'border-slate-200 text-slate-400 dark:border-slate-700'}`}
          aria-pressed={saved}
          aria-label={saved ? 'הסר משמורים' : 'שמור משרה'}
        >
          <StarIcon filled={saved} />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex min-h-11 items-center rounded-xl px-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-expanded={expanded}
        >
          {expanded ? 'פחות' : 'פרטים'}
        </button>
        <div className="relative ms-auto" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 px-2.5 text-sm dark:border-slate-700"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`סטטוס: ${status ? STATUS_LABELS[status.status] : STATUS_LABELS.new} — שינוי`}
          >
            {status ? STATUS_LABELS[status.status] : STATUS_LABELS.new} <DotsIcon />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute end-0 bottom-full z-20 mb-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  role="menuitemradio"
                  aria-checked={status?.status === s}
                  type="button"
                  onClick={() => {
                    onStatus(job, s);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-3 text-start text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {STATUS_LABELS[s]}
                  {status?.status === s && <CheckIcon className="text-brand-600" />}
                </button>
              ))}
              {status && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onStatus(job, undefined);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-3 text-start text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  נקה סטטוס
                </button>
              )}
              {companyName && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (window.confirm(`להסתיר את כל המשרות של "${companyName}"? אפשר לבטל ב"המועמדויות שלי".`)) {
                      onHideCompany(companyName);
                    }
                    setMenuOpen(false);
                  }}
                  className="w-full border-t border-slate-100 px-3 py-3 text-start text-sm text-rose-700 hover:bg-rose-50 dark:border-slate-800 dark:text-rose-400 dark:hover:bg-rose-950"
                >
                  הסתר חברה: <bdi>{companyName}</bdi>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
