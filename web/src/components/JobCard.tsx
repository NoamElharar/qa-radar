import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { BADGE_LABELS, badgeFor, REGION_LABELS, SENIORITY_LABELS, type Badge, type Job } from '@qa-radar/shared';
import {
  INTERVIEW_FORMAT_LABELS,
  interviewFormatOf,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  STATUS_ORDER,
  type JobStatus,
  type StatusEntry,
} from '../lib/storage.ts';
import { textDir } from '../lib/bidi.ts';
import { formatDate, relativeTime } from '../lib/time.ts';
import { CheckIcon, ChevronDownIcon, ClockIcon, CloseIcon, ExternalIcon, PinIcon, StarIcon } from './icons.tsx';
import { StatusDot } from './mine/StatusDot.tsx';

/** Quiet tinted labels (a colored dot + dark text) instead of solid pills: the title stays the loudest thing. */
const BADGE_STYLES: Record<Badge, string> = {
  new: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  fresh: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  back: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const MAX_TAGS = 5;

const RING = 2 * Math.PI * 17;

/**
 * The match score as a ring that fills to the score (out of 100). The number inside carries the
 * meaning; the arc's color (green 70+, amber 40+, gray below) only repeats it.
 */
function ScoreRing({ score, className = '' }: { score: number; className?: string }) {
  const tone =
    score >= 70 ? 'text-mint-500 dark:text-mint-300' : score >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500';
  const value = Math.max(0, Math.min(100, score));
  return (
    <span className={`relative grid size-11 shrink-0 place-items-center ${className}`} title="ציון התאמה לפרופיל">
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r="17" fill="none" strokeWidth="3" className="stroke-brand-100 dark:stroke-slate-700" />
        <circle
          cx="20"
          cy="20"
          r="17"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={`${(value / 100) * RING} ${RING}`}
          className={tone}
        />
      </svg>
      <span className="text-sm font-bold tabular-nums">
        <span className="sr-only">ציון התאמה </span>
        {score}
      </span>
    </span>
  );
}

/** The first letter of the company or agency, standing in for a logo. Decorative. */
function Monogram({ name, className = '' }: { name?: string; className?: string }) {
  const letter = name?.trim().match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? '?';
  return (
    <span
      aria-hidden="true"
      className={`grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-base font-semibold text-brand-700 dark:bg-slate-800 dark:text-slate-300 ${className}`}
    >
      {letter}
    </span>
  );
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

interface MenuPlacement {
  up: boolean;
  /** Only on screens too short for the whole menu: cap it and let it scroll. */
  maxHeight?: number;
}

const MENU_GAP = 8 + 8; // the menu's offset from its button + breathing room

/**
 * Free space above/below the button, between the sticky header and the bottom tab bar. On a wide
 * screen the view menu is a side menu, not a bottom bar, so the screen's own bottom is the limit.
 */
function menuRoom(button: HTMLElement) {
  const rect = button.getBoundingClientRect();
  const top = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
  const nav = document.querySelector('nav[aria-label="תצוגות"]')?.getBoundingClientRect();
  const bottom = nav && nav.top > window.innerHeight / 2 ? nav.top : window.innerHeight;
  return { above: rect.top - top - MENU_GAP, below: bottom - rect.bottom - MENU_GAP, top: rect.top - top };
}

/**
 * Place the status menu (`need` = its full height) so every choice is on screen: above the button if
 * it fits, else below; if neither side has room, scroll the page just enough for it to fit below
 * (the button stays in view). Only a screen shorter than the menu itself gets a scrolling menu.
 */
function placeMenu(button: HTMLElement, need: number): MenuPlacement {
  let room = menuRoom(button);
  if (need <= room.above) return { up: true };
  if (need <= room.below) return { up: false };
  window.scrollBy(0, Math.min(need - room.below, Math.max(0, room.top - 8)));
  room = menuRoom(button);
  if (need <= room.below) return { up: false };
  return room.above > room.below
    ? { up: true, maxHeight: Math.max(120, room.above) }
    : { up: false, maxHeight: Math.max(120, room.below) };
}

export function JobCard({ job, sourceName, status, highlight, now, onStatus, onOpen, onHideCompany }: JobCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPlace, setMenuPlace] = useState<MenuPlacement>({ up: true });
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);
  /** Opened with Enter/Space: focus moves into the menu (a tap leaves focus where it was). */
  const openedByKeyboard = useRef(false);
  const menuItems = () => [...(menuListRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])];

  // Measure the open menu before it paints and put it where all of it is visible.
  useLayoutEffect(() => {
    if (!menuOpen || !menuButtonRef.current || !menuListRef.current) return;
    setMenuPlace(placeMenu(menuButtonRef.current, menuListRef.current.scrollHeight));
    if (openedByKeyboard.current) {
      const items = menuItems();
      (items.find((b) => b.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    }
  }, [menuOpen]);
  const badge = badgeFor(job, now);
  const saved = status?.status === 'saved';
  const companyName = job.company ?? job.agency;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    // Escape closes; when focus was in the menu it goes back to the status button.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const focusInside = menuRef.current?.contains(document.activeElement);
      setMenuOpen(false);
      if (focusInside) menuButtonRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  /** Arrow keys move between the choices (in reading order), Home/End jump to the first/last. */
  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = menuItems();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
  };

  const regionChips = job.regions.map((r) => REGION_LABELS[r]);
  const format = status ? interviewFormatOf(status) : 'unknown';

  return (
    <article
      // Up to 1280 px a card. From there a row of the jobs panel (App puts the rows in one panel):
      // mark | title, place and tags | score | actions, with the details opening underneath.
      className={`relative rounded-2xl border bg-surface p-4 shadow-card xl:grid xl:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem_auto] xl:items-center xl:gap-x-5 xl:gap-y-1 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-5 xl:py-4 xl:shadow-none ${
        highlight ? 'border-rose-300 dark:border-rose-800' : 'border-line'
      } ${job.state === 'closed' ? 'opacity-60' : ''}`}
      aria-labelledby={`job-${job.id}`}
    >
      {highlight && <span className="absolute inset-y-4 -start-px w-1 rounded-e-full bg-rose-500" aria-hidden="true" />}

      {/* Head: company mark · badge, title and company · match score */}
      <div className="flex items-start gap-3 xl:contents">
        <Monogram name={companyName} className="xl:col-start-1 xl:row-span-3 xl:row-start-1 xl:size-11 xl:self-start xl:rounded-2xl" />
        <div className="min-w-0 flex-1 xl:col-start-2 xl:row-start-1">
          {badge && (
            <span className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-2 py-px text-xs font-semibold ${BADGE_STYLES[badge]}`}>
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {BADGE_LABELS[badge]}
            </span>
          )}
          <h3 id={`job-${job.id}`} className="text-base leading-snug font-semibold tracking-tight text-pretty">
            <bdi dir={textDir(job.title)}>{job.title}</bdi>
          </h3>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
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
        </div>
        <ScoreRing score={job.score} className="xl:col-start-3 xl:row-span-3 xl:row-start-1" />
      </div>

      {/* Location · distance · first seen */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted xl:col-start-2 xl:row-start-2 xl:mt-1">
        <span className="inline-flex items-center gap-1">
          <PinIcon className="shrink-0" />
          {[job.city, ...regionChips].filter(Boolean).join(' · ') || 'מיקום לא צוין'}
        </span>
        {job.distanceKm !== undefined && <span>{job.distanceKm} ק״מ מהבית</span>}
        <span className="inline-flex items-center gap-1" title={`נראתה לראשונה ${formatDate(job.firstSeenAt)}`}>
          <ClockIcon className="shrink-0" />
          נראתה {relativeTime(job.firstSeenAt, now)}
        </span>
        {job.postedAt && <span>פורסמה {formatDate(job.postedAt)}</span>}
      </div>

      {/* Row 4: my interview format (when set) + tags + seniority */}
      {(job.tags.length > 0 || job.seniority !== 'unknown' || format !== 'unknown') && (
        <div className="mt-3 flex flex-wrap gap-1.5 xl:col-start-2 xl:row-start-3 xl:mt-1.5">
          {format !== 'unknown' && (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-900/60 dark:text-brand-100">
              ראיון: {INTERVIEW_FORMAT_LABELS[format]}
            </span>
          )}
          {job.seniority !== 'unknown' && (
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-200">
              {SENIORITY_LABELS[job.seniority]}
              {job.yearsRequired ? ` · ${job.yearsRequired}+ שנים` : ''}
            </span>
          )}
          {(expanded ? job.tags : job.tags.slice(0, MAX_TAGS)).map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {t}
            </span>
          ))}
          {!expanded && job.tags.length > MAX_TAGS && (
            <span className="px-1 py-0.5 text-xs text-muted">+{job.tags.length - MAX_TAGS}</span>
          )}
        </div>
      )}

      {/* Row 5: ✓ / ✗ details */}
      {expanded && (
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3.5 text-sm xl:col-span-3 xl:col-start-2 xl:row-start-4 dark:bg-slate-800/60">
          {job.matched.length > 0 && (
            <p>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckIcon className="shrink-0" />
                יש לי:
              </span>{' '}
              {job.matched.join(' · ')}
            </p>
          )}
          {job.missing.length > 0 && (
            <p>
              <span className="inline-flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-400">
                <CloseIcon className="shrink-0" />
                חסר:
              </span>{' '}
              {job.missing.join(' · ')}
            </p>
          )}
          {!job.matched.length && !job.missing.length && <p className="text-muted">לא זוהו כישורים בתיאור המשרה.</p>}
          {job.snippet && (
            <p className="text-slate-600 dark:text-slate-300">
              <bdi>{job.snippet}</bdi>
            </p>
          )}
          <p className="text-xs text-muted">
            מקור: {sourceName}
            {job.locationText ? ` · מיקום במקור: ${job.locationText}` : ''}
          </p>
        </div>
      )}

      {/*
        Row 6: actions. Every label stays on one line and the star keeps its 44 px; on a narrow phone
        a long status name ("ראיון שיחת וידאו") is what gets shortened, and the menu shows it in full.
      */}
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 xl:col-start-4 xl:row-span-3 xl:row-start-1 xl:mt-0 xl:border-t-0 xl:pt-0">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onOpen(job)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand-700 px-3.5 text-sm font-semibold whitespace-nowrap text-white shadow-sm transition-[background-color,scale] duration-150 hover:bg-brand-800 active:scale-[.97] motion-reduce:transition-none"
        >
          הגש מועמדות <ExternalIcon className="max-[390px]:hidden" />
        </a>
        <button
          type="button"
          onClick={() => onStatus(job, saved ? undefined : 'saved')}
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-lg transition-colors duration-150 ${saved ? 'bg-amber-50 text-amber-500 dark:bg-amber-950' : 'text-muted hover:bg-slate-100 hover:text-amber-600 dark:hover:bg-slate-800 dark:hover:text-amber-400'}`}
          aria-pressed={saved}
          aria-label={saved ? 'הסר משמורים' : 'שמור משרה'}
        >
          <StarIcon filled={saved} />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2.5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-expanded={expanded}
        >
          {expanded ? 'פחות' : 'פרטים'}
        </button>
        <div className="relative ms-auto min-w-0" ref={menuRef} onBlur={(e) => {
          // Tabbing out of the menu closes it (a click elsewhere has no focus target, and is handled above).
          if (menuOpen && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setMenuOpen(false);
        }}>
          <button
            type="button"
            ref={menuButtonRef}
            onClick={(e) => {
              openedByKeyboard.current = e.detail === 0;
              setMenuOpen((v) => !v);
            }}
            className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-full bg-slate-100 px-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-200 aria-expanded:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:aria-expanded:bg-slate-700"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`סטטוס: ${status ? STATUS_LABELS[status.status] : STATUS_LABELS.new} — שינוי`}
            title={status ? STATUS_LABELS[status.status] : STATUS_LABELS.new}
          >
            <span className="truncate">{status ? STATUS_LABELS[status.status] : STATUS_LABELS.new}</span>
            <ChevronDownIcon className={`shrink-0 text-muted transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              ref={menuListRef}
              onKeyDown={onMenuKeyDown}
              style={menuPlace.maxHeight ? { maxHeight: menuPlace.maxHeight } : undefined}
              // Two columns: eleven statuses stay one short block (6 rows) that fits a phone screen.
              // It grows out of the status button (150 ms), unless the OS asks for less motion.
              className={`absolute end-0 z-20 grid w-72 grid-cols-2 gap-0.5 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-float transition-[opacity,scale] duration-150 ease-snappy motion-reduce:transition-none starting:scale-95 starting:opacity-0 ${
                menuPlace.up ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'
              }`}
            >
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  role="menuitemradio"
                  aria-checked={status?.status === s}
                  title={STATUS_DESCRIPTIONS[s]}
                  type="button"
                  onClick={() => {
                    onStatus(job, s);
                    setMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 text-start text-sm transition-colors duration-100 hover:bg-slate-100 dark:hover:bg-slate-800 ${status?.status === s ? 'bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900/60 dark:text-brand-100' : ''}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusDot status={s} />
                    {STATUS_LABELS[s]}
                  </span>
                  {status?.status === s && <CheckIcon className="shrink-0 text-brand-700 dark:text-brand-100" />}
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
                  className="col-span-2 mt-1 w-full rounded-lg px-2.5 py-2.5 text-start text-sm text-muted transition-colors duration-100 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                  className="col-span-2 w-full rounded-lg px-2.5 py-2.5 text-start text-sm text-rose-700 transition-colors duration-100 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
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
