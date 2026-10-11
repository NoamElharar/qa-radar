import type { WatchedJob } from '@qa-radar/shared';
import type { JobCandidate } from './normalize.ts';
import { shortHash } from './ids.ts';

/**
 * Reduce a watch-mode run to content-free entries: a hash of each QA job's id, when we first saw
 * it and our match score. Jobs still listed keep their first-seen date; jobs that left the site
 * drop out. On the source's first successful check every entry is a silent baseline, so jobs that
 * were already open never count as new.
 */
export function summarizeWatch(
  previous: WatchedJob[] | undefined,
  jobs: Array<Pick<JobCandidate, 'id' | 'score'>>,
  nowIso: string,
): WatchedJob[] {
  const known = new Map((previous ?? []).map((w) => [w.key, w]));
  const out = new Map<string, WatchedJob>();
  for (const job of jobs) {
    const key = shortHash(job.id);
    const before = known.get(key);
    out.set(key, {
      key,
      firstSeenAt: before?.firstSeenAt ?? nowIso,
      score: job.score,
      ...((before ? before.baseline : !previous) ? { baseline: true } : {}),
    });
  }
  return [...out.values()];
}
