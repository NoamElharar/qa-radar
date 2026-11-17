import type { WatchedJob } from '@qa-radar/shared';
import type { JobCandidate } from './normalize.ts';
import { shortHash } from './ids.ts';

/** What a watch run keeps of each QA job: its id (hashed) and our classification — no title, no text. */
export type WatchInput = Pick<JobCandidate, 'id' | 'score'> &
  Partial<Pick<JobCandidate, 'requires' | 'tags' | 'seniority' | 'yearsRequired'>>;

/**
 * Reduce a watch-mode run to content-free entries: a hash of each QA job's id, when we first saw
 * it, our match score and what it was computed from (skill labels, level, years, bonus tags), so a
 * CV can re-score it. Jobs still listed keep their first-seen date; jobs that left the site drop
 * out. On the source's first successful check every entry is a silent baseline, so jobs that were
 * already open never count as new.
 *
 * `bonusTags`: only these tags are kept (the others don't affect the score).
 */
export function summarizeWatch(
  previous: WatchedJob[] | undefined,
  jobs: WatchInput[],
  nowIso: string,
  bonusTags: ReadonlySet<string> = new Set(),
): WatchedJob[] {
  const known = new Map((previous ?? []).map((w) => [w.key, w]));
  const out = new Map<string, WatchedJob>();
  for (const job of jobs) {
    const key = shortHash(job.id);
    const before = known.get(key);
    const tags = job.tags?.filter((t) => bonusTags.has(t)) ?? [];
    out.set(key, {
      key,
      firstSeenAt: before?.firstSeenAt ?? nowIso,
      score: job.score,
      ...((before ? before.baseline : !previous) ? { baseline: true } : {}),
      ...(job.requires ? { requires: job.requires } : {}),
      ...(tags.length ? { tags } : {}),
      ...(job.seniority ? { seniority: job.seniority } : {}),
      ...(job.yearsRequired !== undefined ? { yearsRequired: job.yearsRequired } : {}),
    });
  }
  return [...out.values()];
}
