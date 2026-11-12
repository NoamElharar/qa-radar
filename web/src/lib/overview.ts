import type { Job } from '@qa-radar/shared';
import { isStale, type MineItem } from './mine.ts';
import type { JobStatus } from './storage.ts';

/**
 * "סקירה", the home screen: the few numbers worth seeing first. Framework-free and unit-tested, like
 * stats.ts; nothing here is saved, so it can change freely without touching anyone's data.
 */

const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hourCycle: 'h23' });

/** "בוקר טוב" from 05:00, "צהריים טובים" from 12:00, "ערב טוב" from 17:00, "לילה טוב" from 22:00 (Israel time). */
export function greeting(now: Date): string {
  const hour = Number(hourFmt.format(now));
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 22) return 'ערב טוב';
  return 'לילה טוב';
}

/**
 * The jobs as they stood at `at`: only those already seen by then, and without a comeback that only
 * happened later. Run through the "חדש היום" filter with `now = at`, it gives yesterday's count.
 */
export function asOf(jobs: Job[], at: Date): Job[] {
  const t = at.getTime();
  return jobs
    .filter((j) => Date.parse(j.firstSeenAt) <= t)
    .map((j) => (j.reappearedAt && Date.parse(j.reappearedAt) > t ? { ...j, reappearedAt: undefined } : j));
}

/** Statuses of an application that is still moving, the furthest along first. */
export const IN_PROCESS: JobStatus[] = [
  'offer',
  'awaiting_answer',
  'interview_frontal',
  'interview_video',
  'interview',
  'home_assignment',
  'recruiter_call',
];

/** Applications that are still moving: the furthest along first, then the most recently updated. */
export function inProcess(items: MineItem[]): MineItem[] {
  const rank = (i: MineItem) => IN_PROCESS.indexOf(i.entry.status);
  return items
    .filter((i) => rank(i) >= 0)
    .sort((a, b) => rank(a) - rank(b) || Date.parse(b.entry.updatedAt) - Date.parse(a.entry.updatedAt));
}

export interface Waiting {
  /** "הגשתי" with no answer yet. */
  total: number;
  /** Of those, the ones waiting STALE_DAYS+ days. */
  stale: number;
}

export function waitingForAnswer(items: MineItem[], now: Date): Waiting {
  const waiting = items.filter((i) => i.entry.status === 'applied');
  return { total: waiting.length, stale: waiting.filter((i) => isStale(i.entry, now)).length };
}

export interface Bar {
  /** The week's applications as a share of the busiest week's (0–1): the pill's height. */
  height: number;
  /** The share of the week's applications that got an answer (0–1): the filled part of the pill. */
  fill: number;
}

/** The pill chart of applications and answers per week. */
export function bars(weeks: Array<{ applications: number; replied: number }>): Bar[] {
  const max = Math.max(0, ...weeks.map((w) => w.applications));
  return weeks.map((w) => ({
    height: max ? w.applications / max : 0,
    fill: w.applications ? Math.min(1, w.replied / w.applications) : 0,
  }));
}

/** "13.10" for the week that starts on 2026-10-13. */
export function weekLabel(week: string): string {
  const [, m, d] = week.split('-').map(Number);
  return `${d}.${m}`;
}
