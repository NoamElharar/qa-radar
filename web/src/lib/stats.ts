import type { SourceHealth } from '@qa-radar/shared';
import { isApplication, sameCompany, weekStart, type MineItem } from './mine.ts';
import { historyOf, type JobStatus } from './storage.ts';
import { israelDayKey } from './time.ts';

/**
 * "סטטיסטיקה": what happened to my applications, computed from the status histories saved in this
 * browser. Framework-free, so every number on the page is unit-tested.
 */

/** A rate over fewer applications than this is noise: the page shows the counts only. */
export const MIN_RATE_BASE = 5;
const DAY_MS = 864e5;

/** Any answer from the other side, a rejection included. */
const REPLY: ReadonlySet<JobStatus> = new Set([
  'recruiter_call',
  'home_assignment',
  'interview',
  'interview_video',
  'interview_frontal',
  'awaiting_answer',
  'offer',
  'rejected',
]);
/** A real conversation: a call, a home assignment, an interview or an offer. */
const CONVERSATION: ReadonlySet<JobStatus> = new Set([
  'recruiter_call',
  'home_assignment',
  'interview',
  'interview_video',
  'interview_frontal',
  'awaiting_answer',
  'offer',
]);
/** An interview of any kind (an offer comes after one). */
const INTERVIEW: ReadonlySet<JobStatus> = new Set([
  'interview',
  'interview_video',
  'interview_frontal',
  'offer',
]);

/** The percentage, or undefined when the base is too small for a percentage to mean anything. */
export function rate(count: number, of: number): number | undefined {
  return of >= MIN_RATE_BASE ? Math.round((count / of) * 100) : undefined;
}

// ── One application ─────────────────────────────────────────────────────────────────

/** Each stage counts the applications that got at least that far. */
export type FunnelStage = 'applied' | 'replied' | 'conversation' | 'interview' | 'offer';
export const FUNNEL_STAGES: FunnelStage[] = [
  'applied',
  'replied',
  'conversation',
  'interview',
  'offer',
];

export interface AppFacts {
  id: string;
  appliedAt?: string;
  /** Who sent my CV: the agency, or the company itself for a direct application. */
  submitter: string;
  /** Added by hand (usually after a call), not applied to from the radar. */
  manual: boolean;
  reached: Record<FunnelStage, boolean>;
  homeAssignment: boolean;
  frontal: boolean;
  rejected: boolean;
  /** Still going: the current status is a call, a home assignment, an interview or a wait. */
  inProcess: boolean;
  /** Whole days (Israel calendar) from applying to the first answer, when both dates were recorded. */
  replyDays?: number;
  /** Answered on a date that was guessed, so it is left out of the reply times. */
  replyDateEstimated: boolean;
}

/** The source an item came from: the job's, or the prefix of its id once the job is gone. */
export const sourceIdOf = (item: MineItem): string =>
  item.job?.sourceId ?? item.id.slice(0, item.id.indexOf(':'));

/**
 * Who sent my CV. A radar job from an agency or a company's own site: the source's name. A job
 * board or a hand-added application: the agency or company named on it.
 */
export function submitterName(
  item: MineItem,
  source?: Pick<SourceHealth, 'name' | 'type'>,
): string {
  if (!item.entry.manual && source && source.type !== 'board') return source.name;
  return (item.job?.agency ?? item.company?.trim()) || source?.name || 'לא ידוע';
}

const dayNumber = (iso: string) => Date.parse(`${israelDayKey(iso)}T12:00:00Z`) / DAY_MS;

export function factsOf(item: MineItem, submitter: string): AppFacts {
  const { entry } = item;
  const steps = historyOf(entry);
  const has = (set: ReadonlySet<JobStatus>) => steps.some((s) => set.has(s.status));
  const reply = steps.find((s) => REPLY.has(s.status));
  const appliedAt = entry.appliedAt ?? steps.find((s) => s.status === 'applied')?.at;
  const dated = Boolean(reply && appliedAt && !reply.estimated);
  return {
    id: item.id,
    appliedAt,
    submitter,
    manual: Boolean(entry.manual),
    reached: {
      applied: true,
      replied: Boolean(reply),
      conversation: has(CONVERSATION),
      interview: has(INTERVIEW),
      offer: steps.some((s) => s.status === 'offer'),
    },
    homeAssignment: steps.some((s) => s.status === 'home_assignment'),
    frontal: steps.some((s) => s.status === 'interview_frontal'),
    rejected: steps.some((s) => s.status === 'rejected'),
    inProcess: CONVERSATION.has(entry.status) && entry.status !== 'offer',
    ...(dated
      ? { replyDays: Math.max(0, Math.round(dayNumber(reply!.at) - dayNumber(appliedAt!))) }
      : {}),
    replyDateEstimated: Boolean(reply && !dated),
  };
}

/** The applications among the saved items, each reduced to its facts. */
export function collectFacts(
  items: MineItem[],
  sourceOf: (sourceId: string) => Pick<SourceHealth, 'name' | 'type'> | undefined,
): AppFacts[] {
  return items
    .filter((item) => isApplication(item.entry))
    .map((item) => factsOf(item, submitterName(item, sourceOf(sourceIdOf(item)))));
}

// ── The page ────────────────────────────────────────────────────────────────────────

export type StatsPeriod = 'all' | '90d' | '30d';
export const STATS_PERIODS: StatsPeriod[] = ['all', '90d', '30d'];
export const STATS_PERIOD_LABELS: Record<StatsPeriod, string> = {
  all: 'כל התקופה',
  '90d': '90 הימים האחרונים',
  '30d': '30 הימים האחרונים',
};
const PERIOD_DAYS: Record<StatsPeriod, number> = { all: Infinity, '90d': 90, '30d': 30 };

export interface FunnelRow {
  stage: FunnelStage;
  count: number;
  /** The previous stage's count: the base of this step's rate. */
  of?: number;
}

export interface Tally {
  applications: number;
  replied: number;
}

export interface SubmitterRow extends Tally {
  name: string;
  /** The folded "אחרים" row: how many names it holds. */
  names?: number;
}

export interface WeekCohort extends Tally {
  /** YYYY-MM-DD of the Sunday that starts the week. */
  week: string;
}

export interface DelayBucket {
  label: string;
  count: number;
}

export interface Silence {
  days: number;
  /** Applications at least this old. */
  eligible: number;
  /** Of those, the ones with no answer at all. */
  noReply: number;
}

export interface Stats extends Tally {
  firstAppliedAt?: string;
  /** Applications with no date: counted everywhere except the weekly chart and the silences. */
  undated: number;
  funnel: FunnelRow[];
  homeAssignments: number;
  frontals: number;
  rejected: number;
  inProcess: number;
  submitters: SubmitterRow[];
  radar: Tally;
  manual: Tally;
  weekly: WeekCohort[];
  delays: {
    /** Answers whose date and application date were both recorded. */
    known: number;
    /** Answers left out because their date is a guess. */
    estimated: number;
    medianDays?: number;
    buckets: DelayBucket[];
  };
  silences: Silence[];
}

const DELAY_BUCKETS: Array<{ label: string; max: number }> = [
  { label: 'באותו יום', max: 0 },
  { label: '1–3 ימים', max: 3 },
  { label: '4–7 ימים', max: 7 },
  { label: '8–14 ימים', max: 14 },
  { label: '15 ימים ומעלה', max: Infinity },
];
export const SILENCE_DAYS = [14, 30];
/** Agencies and companies shown by name; the rest are folded into "אחרים". */
export const TOP_SUBMITTERS = 8;
export const MAX_WEEKS = 12;

const tally = (facts: AppFacts[]): Tally => ({
  applications: facts.length,
  replied: facts.filter((f) => f.reached.replied).length,
});

/** One row per agency or company (spellings of one name are joined), the biggest first. */
export function bySubmitter(facts: AppFacts[], top = TOP_SUBMITTERS): SubmitterRow[] {
  const rows: SubmitterRow[] = [];
  // Radar jobs first, so a group is named the way its source names itself.
  for (const f of [...facts].sort((a, b) => Number(a.manual) - Number(b.manual))) {
    let row = rows.find((r) => sameCompany(r.name, f.submitter));
    if (!row) rows.push((row = { name: f.submitter, applications: 0, replied: 0 }));
    row.applications += 1;
    if (f.reached.replied) row.replied += 1;
  }
  rows.sort(
    (a, b) =>
      b.applications - a.applications ||
      b.replied - a.replied ||
      a.name.localeCompare(b.name, 'he'),
  );
  // Folding a single row into "אחרים" would only hide its name.
  if (rows.length <= top + 1) return rows;
  const rest = rows.slice(top);
  return [
    ...rows.slice(0, top),
    {
      name: 'אחרים',
      applications: rest.reduce((n, r) => n + r.applications, 0),
      replied: rest.reduce((n, r) => n + r.replied, 0),
      names: rest.length,
    },
  ];
}

const addWeeks = (week: string, n: number) => {
  const d = new Date(`${week}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
};

/** Applications per week, and how many of each week's applications got an answer (so far). */
export function weeklyCohorts(facts: AppFacts[], now: Date, maxWeeks = MAX_WEEKS): WeekCohort[] {
  const dated = facts.filter((f) => f.appliedAt);
  if (!dated.length) return [];
  const byWeek = new Map<string, AppFacts[]>();
  for (const f of dated) {
    const week = weekStart(new Date(f.appliedAt!));
    byWeek.set(week, [...(byWeek.get(week) ?? []), f]);
  }
  const current = weekStart(now);
  const first = [...byWeek.keys()].sort()[0]!;
  const weeks: WeekCohort[] = [];
  for (let week = first; week <= current; week = addWeeks(week, 1)) {
    weeks.push({ week, ...tally(byWeek.get(week) ?? []) });
  }
  return weeks.slice(-maxWeeks);
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function computeStats(all: AppFacts[], now: Date, period: StatsPeriod = 'all'): Stats {
  const from = now.getTime() - PERIOD_DAYS[period] * DAY_MS;
  const facts =
    period === 'all' ? all : all.filter((f) => f.appliedAt && Date.parse(f.appliedAt) >= from);
  const count = (pick: (f: AppFacts) => boolean) => facts.filter(pick).length;

  const funnel: FunnelRow[] = FUNNEL_STAGES.map((stage, i) => ({
    stage,
    count: count((f) => f.reached[stage]),
    ...(i ? { of: count((f) => f.reached[FUNNEL_STAGES[i - 1]!]) } : {}),
  }));

  const days = facts.flatMap((f) => (f.replyDays === undefined ? [] : [f.replyDays]));
  const dates = facts.flatMap((f) => (f.appliedAt ? [f.appliedAt] : [])).sort();

  return {
    ...tally(facts),
    firstAppliedAt: dates[0],
    undated: facts.length - dates.length,
    funnel,
    homeAssignments: count((f) => f.homeAssignment),
    frontals: count((f) => f.frontal),
    rejected: count((f) => f.rejected),
    inProcess: count((f) => f.inProcess),
    submitters: bySubmitter(facts),
    radar: tally(facts.filter((f) => !f.manual)),
    manual: tally(facts.filter((f) => f.manual)),
    weekly: weeklyCohorts(facts, now),
    delays: {
      known: days.length,
      estimated: count((f) => f.replyDateEstimated),
      medianDays: median(days),
      buckets: DELAY_BUCKETS.map(({ label, max }, i) => ({
        label,
        count: days.filter((d) => d <= max && d > (DELAY_BUCKETS[i - 1]?.max ?? -1)).length,
      })),
    },
    silences: SILENCE_DAYS.map((d) => {
      const old = facts.filter(
        (f) => f.appliedAt && now.getTime() - Date.parse(f.appliedAt) >= d * DAY_MS,
      );
      return {
        days: d,
        eligible: old.length,
        noReply: old.filter((f) => !f.reached.replied).length,
      };
    }),
  };
}
