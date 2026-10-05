import { matchesQuery, type Job } from '@qa-radar/shared';
import type { JobStatus, StatusEntry } from './storage.ts';

/**
 * Logic for "המועמדויות שלי" — kept framework-free so it can be unit-tested and stays fast with
 * hundreds of applications.
 */

/** An application with no update for this long is "waiting for an answer" (follow up or close it). */
export const STALE_DAYS = 14;
const DAY_MS = 864e5;

export type MineFlag = 'pinned' | 'stale' | 'notes' | 'manual';
export type MineSort = 'updated' | 'applied' | 'waiting' | 'company';
export type AppliedWindow = 'any' | '7d' | '30d' | '90d';

export interface MineFilters {
  q: string;
  statuses: JobStatus[];
  flags: MineFlag[];
  applied: AppliedWindow;
  sort: MineSort;
}

export const DEFAULT_MINE_FILTERS: MineFilters = {
  q: '',
  statuses: [],
  flags: [],
  applied: 'any',
  sort: 'updated',
};

export const MINE_SORT_LABELS: Record<MineSort, string> = {
  updated: 'עודכן לאחרונה',
  applied: 'הוגש לאחרונה',
  waiting: 'ממתינות הכי הרבה זמן',
  company: 'חברה (א–ת)',
};

export const APPLIED_WINDOW_LABELS: Record<AppliedWindow, string> = {
  any: 'כל התאריכים',
  '7d': 'הוגש ב-7 ימים',
  '30d': 'הוגש ב-30 יום',
  '90d': 'הוגש ב-90 יום',
};
const WINDOW_MS: Record<AppliedWindow, number> = {
  any: Infinity,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
};

/** Pipeline order: the funnel first, then the outcomes. */
export const PIPELINE: JobStatus[] = ['saved', 'applied', 'interview', 'offer'];
export const OUTCOMES: JobStatus[] = ['rejected', 'irrelevant', 'viewed'];
/** Group order in the list: most actionable first. */
export const GROUP_ORDER: JobStatus[] = [
  'offer',
  'interview',
  'applied',
  'saved',
  'rejected',
  'irrelevant',
  'viewed',
];
/** Groups that start collapsed (finished or not-really-applications). */
export const COLLAPSED_BY_DEFAULT: ReadonlySet<JobStatus> = new Set([
  'rejected',
  'irrelevant',
  'viewed',
]);

const APPLIED_STATUSES: ReadonlySet<JobStatus> = new Set(['applied', 'interview', 'offer']);

export interface MineItem {
  id: string;
  entry: StatusEntry;
  title: string;
  company?: string;
  url?: string;
  /** The live job, when it is still in jobs.json. */
  job?: Job;
  /** True when the posting is no longer listed (closed or archived). */
  gone: boolean;
}

export function buildItems(
  statuses: Record<string, StatusEntry>,
  jobsById: Map<string, Job>,
): MineItem[] {
  return Object.entries(statuses).map(([id, entry]) => {
    const job = jobsById.get(id);
    return {
      id,
      entry,
      job,
      title: job?.title ?? entry.snapshot?.title ?? id,
      company: job ? (job.company ?? job.agency) : entry.snapshot?.company,
      url: job?.url ?? entry.snapshot?.url,
      // Manual entries never had a collected posting, so they can't "disappear".
      gone: !entry.manual && (!job || job.state === 'closed'),
    };
  });
}

/** Counts as an application: has an application date, or a status that implies one. */
export function isApplication(entry: StatusEntry): boolean {
  return Boolean(entry.appliedAt) || APPLIED_STATUSES.has(entry.status);
}

/** Whole days since the application (or the last update when no date was recorded). */
export function daysWaiting(entry: StatusEntry, now: Date): number {
  const since = Date.parse(entry.appliedAt ?? entry.updatedAt);
  return Math.max(0, Math.floor((now.getTime() - since) / DAY_MS));
}

/** "הגשתי" with no news for STALE_DAYS+ days — time to follow up, or mark it as rejected. */
export function isStale(entry: StatusEntry, now: Date): boolean {
  if (entry.status !== 'applied') return false;
  const lastNews = Math.max(
    Date.parse(entry.updatedAt),
    Date.parse(entry.appliedAt ?? entry.updatedAt),
  );
  return now.getTime() - lastNews >= STALE_DAYS * DAY_MS;
}

export function applyMineFilters(items: MineItem[], f: MineFilters, now: Date): MineItem[] {
  const filtered = items.filter(({ entry, title, company }) => {
    if (f.statuses.length && !f.statuses.includes(entry.status)) return false;
    if (f.flags.includes('pinned') && !entry.pinned) return false;
    if (f.flags.includes('stale') && !isStale(entry, now)) return false;
    if (f.flags.includes('notes') && !entry.note?.trim()) return false;
    if (f.flags.includes('manual') && !entry.manual) return false;
    if (f.applied !== 'any') {
      if (!entry.appliedAt || now.getTime() - Date.parse(entry.appliedAt) > WINDOW_MS[f.applied])
        return false;
    }
    if (
      f.q &&
      !matchesQuery([title, company, entry.note, entry.channel].filter(Boolean).join(' '), f.q)
    )
      return false;
    return true;
  });
  const appliedTime = (e: StatusEntry) => (e.appliedAt ? Date.parse(e.appliedAt) : 0);
  const compare: Record<MineSort, (a: MineItem, b: MineItem) => number> = {
    updated: (a, b) => b.entry.updatedAt.localeCompare(a.entry.updatedAt),
    applied: (a, b) =>
      appliedTime(b.entry) - appliedTime(a.entry) ||
      b.entry.updatedAt.localeCompare(a.entry.updatedAt),
    waiting: (a, b) => daysWaiting(b.entry, now) - daysWaiting(a.entry, now),
    company: (a, b) =>
      (a.company ?? '').localeCompare(b.company ?? '', 'he') ||
      a.title.localeCompare(b.title, 'he'),
  };
  return filtered.sort(compare[f.sort]);
}

/** Pinned items first (most recently pinned on top), then the rest grouped by status in GROUP_ORDER. */
export function groupItems(items: MineItem[]): {
  pinned: MineItem[];
  groups: Array<{ status: JobStatus; items: MineItem[] }>;
} {
  const pinned = items
    .filter((i) => i.entry.pinned)
    .sort((a, b) => (b.entry.pinnedAt ?? '').localeCompare(a.entry.pinnedAt ?? ''));
  const rest = items.filter((i) => !i.entry.pinned);
  const groups = GROUP_ORDER.map((status) => ({
    status,
    items: rest.filter((i) => i.entry.status === status),
  })).filter((g) => g.items.length);
  return { pinned, groups };
}

// ── Statistics ──────────────────────────────────────────────────────────────────────

const weekdayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jerusalem',
  weekday: 'short',
});
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' });
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Sunday (Israel calendar) of the week containing `date`, as YYYY-MM-DD. */
export function weekStart(date: Date): string {
  const [y, m, d] = ymdFmt.format(date).split('-').map(Number) as [number, number, number];
  const back = WEEKDAYS.indexOf(weekdayFmt.format(date));
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

export interface WeekCount {
  /** YYYY-MM-DD of the Sunday that starts the week. */
  week: string;
  count: number;
}

export interface MineStats {
  byStatus: Record<JobStatus, number>;
  applications: number;
  /** Interview or offer — the share of applications that turned into a real conversation. */
  interviews: number;
  interviewRate: number;
  appliedThisWeek: number;
  appliedLastWeek: number;
  stale: number;
  /** Applications per week, oldest → newest, ending with the current week. */
  weekly: WeekCount[];
}

export function mineStats(items: MineItem[], now: Date, weeks = 8): MineStats {
  const byStatus = {
    viewed: 0,
    saved: 0,
    applied: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    irrelevant: 0,
  } as Record<JobStatus, number>;
  const perWeek = new Map<string, number>();
  let applications = 0;
  let interviews = 0;
  let stale = 0;
  for (const { entry } of items) {
    byStatus[entry.status] += 1;
    if (isApplication(entry)) applications += 1;
    if (entry.status === 'interview' || entry.status === 'offer') interviews += 1;
    if (isStale(entry, now)) stale += 1;
    if (entry.appliedAt) {
      const key = weekStart(new Date(entry.appliedAt));
      perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
    }
  }
  const current = weekStart(now);
  const weekly: WeekCount[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(`${current}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    const week = d.toISOString().slice(0, 10);
    weekly.push({ week, count: perWeek.get(week) ?? 0 });
  }
  return {
    byStatus,
    applications,
    interviews,
    interviewRate: applications ? interviews / applications : 0,
    appliedThisWeek: weekly.at(-1)?.count ?? 0,
    appliedLastWeek: weekly.at(-2)?.count ?? 0,
    stale,
    weekly,
  };
}

// ── URL state (only while view=mine) ─────────────────────────────────────────────────

const STATUS_VALUES: JobStatus[] = [
  'viewed',
  'saved',
  'applied',
  'interview',
  'offer',
  'rejected',
  'irrelevant',
];
const FLAG_VALUES: MineFlag[] = ['pinned', 'stale', 'notes', 'manual'];
const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export function mineFiltersFromParams(p: URLSearchParams): MineFilters {
  const sort = p.get('msort') as MineSort | null;
  const applied = p.get('mt') as AppliedWindow | null;
  return {
    q: p.get('mq') ?? '',
    statuses: list(p.get('ms')).filter((s): s is JobStatus =>
      STATUS_VALUES.includes(s as JobStatus),
    ),
    flags: list(p.get('mf')).filter((f): f is MineFlag => FLAG_VALUES.includes(f as MineFlag)),
    applied: applied && applied in APPLIED_WINDOW_LABELS ? applied : 'any',
    sort: sort && sort in MINE_SORT_LABELS ? sort : 'updated',
  };
}

/** Writes the "שלי" filters into an existing query string (keeps view=mine and anything else). */
export function writeMineParams(base: URLSearchParams, f: MineFilters): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const key of ['mq', 'ms', 'mf', 'mt', 'msort']) p.delete(key);
  if (f.q) p.set('mq', f.q);
  if (f.statuses.length) p.set('ms', f.statuses.join(','));
  if (f.flags.length) p.set('mf', f.flags.join(','));
  if (f.applied !== 'any') p.set('mt', f.applied);
  if (f.sort !== 'updated') p.set('msort', f.sort);
  return p;
}

export function activeMineFilterCount(f: MineFilters): number {
  return f.statuses.length + f.flags.length + (f.applied !== 'any' ? 1 : 0) + (f.q ? 1 : 0);
}

// ── Manual applications ──────────────────────────────────────────────────────────────

/** Suggestions for "where did I apply" (free text is allowed too). */
export const CHANNEL_SUGGESTIONS = [
  'LinkedIn',
  'AllJobs',
  'דרושים',
  'Indeed',
  'Glassdoor',
  'Jobnet',
  'אתר החברה',
  'חברת השמה',
  'חבר מביא חבר',
  'וואטסאפ / טלגרם',
];

export interface ManualInput {
  title: string;
  company?: string;
  url?: string;
  channel?: string;
  status: JobStatus;
  /** YYYY-MM-DD from the date input; empty = not applied yet. */
  appliedDate?: string;
  note?: string;
}

function isWebLink(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** Validates the "add application" form and builds a status entry. Returns an error message instead when invalid. */
export function createManualEntry(
  input: ManualInput,
  now: Date,
): { id: string; entry: StatusEntry } | { error: string } {
  const title = input.title.trim();
  if (!title) return { error: 'צריך לכתוב את שם המשרה' };
  const url = input.url?.trim();
  if (url && !isWebLink(url)) return { error: 'הקישור צריך להתחיל ב-https://' };
  const appliedAt = input.appliedDate
    ? new Date(`${input.appliedDate}T12:00:00`).toISOString()
    : undefined;
  const id = `manual:${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    entry: {
      status: input.status,
      appliedAt: appliedAt ?? (input.status === 'applied' ? now.toISOString() : undefined),
      updatedAt: now.toISOString(),
      note: input.note?.trim() || undefined,
      manual: true,
      channel: input.channel?.trim() || undefined,
      snapshot: { title, company: input.company?.trim() || undefined, url: url ?? '' },
    },
  };
}
