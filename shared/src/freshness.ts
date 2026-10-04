import type { Job } from './types.ts';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const NEW_WINDOW_MS = DAY_MS;
export const FRESH_WINDOW_MS = 3 * DAY_MS;
export const BACK_WINDOW_MS = 3 * DAY_MS;

export type Badge = 'new' | 'fresh' | 'back' | 'closed';

export const BADGE_LABELS: Record<Badge, string> = {
  new: 'חדש',
  fresh: 'טרי',
  back: 'חזרה',
  closed: 'נסגרה',
};

type BadgeInput = Pick<Job, 'state' | 'firstSeenAt' | 'reappearedAt' | 'baseline'>;

/**
 * Freshness badge for a job. Based on *our* first-seen time, never on the source's posting date,
 * because many sites re-date old postings. Baseline jobs (first run of a source) get no badge.
 */
export function badgeFor(job: BadgeInput, now: Date = new Date()): Badge | null {
  if (job.state === 'closed') return 'closed';
  const t = now.getTime();
  if (job.reappearedAt && t - Date.parse(job.reappearedAt) < BACK_WINDOW_MS) return 'back';
  if (job.baseline) return null;
  const age = t - Date.parse(job.firstSeenAt);
  if (age < NEW_WINDOW_MS) return 'new';
  if (age < FRESH_WINDOW_MS) return 'fresh';
  return null;
}

/** True when the job appeared (non-baseline) or reappeared after the given instant. */
export function isNewSince(job: BadgeInput, since: Date): boolean {
  if (job.state === 'closed') return false;
  const s = since.getTime();
  if (job.reappearedAt && Date.parse(job.reappearedAt) > s) return true;
  return !job.baseline && Date.parse(job.firstSeenAt) > s;
}
