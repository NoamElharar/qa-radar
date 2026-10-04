import type { Job, SourceHealth } from '@qa-radar/shared';
import { DAY_MS } from '@qa-radar/shared';
import type { JobCandidate } from './normalize.ts';

/** A job is closed after this many consecutive *successful* runs of its source without it. */
export const CLOSE_AFTER_MISSES = 3;
/** Closed jobs stay visible ("נסגרה") for this long, then move to the archive. */
export const KEEP_CLOSED_MS = 14 * DAY_MS;
const RECENT_COUNTS = 10;

export interface SourceRunResult {
  sourceId: string;
  /** False when the adapter threw (network, HTTP error, robots, parse failure). */
  ok: boolean;
  error?: string;
  /** Jobs returned by the source (all professions) — used for sanity checks. */
  fetched: number;
  /** QA-relevant, classified jobs. */
  jobs: JobCandidate[];
  durationMs?: number;
}

export interface MergeInput {
  previousJobs: Job[];
  previousHealth: Map<string, SourceHealth>;
  results: SourceRunResult[];
  now: Date;
}

export interface MergeOutput {
  jobs: Job[];
  archived: Job[];
  /** Updated health for the sources that ran (keyed by source id). */
  health: Map<string, Partial<SourceHealth> & Pick<SourceHealth, 'status' | 'consecutiveFailures' | 'baselineDone' | 'recentCounts'>>;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * A run that "succeeded" but returned far fewer jobs than usual is more likely a broken parser or a
 * soft block than a real hiring freeze. Treat it as failed so jobs aren't wrongly closed.
 */
export function isSuspiciousDrop(fetched: number, recentCounts: number[]): boolean {
  const usual = median(recentCounts);
  if (usual <= 0) return false;
  if (fetched === 0) return true;
  return usual >= 10 && fetched < usual * 0.3;
}

/**
 * Merge one collector run into the previous state. Pure function — all freshness rules live here:
 *  - new job → firstSeenAt = now; silent `baseline` when it is the source's first successful run;
 *  - seen again → lastSeenAt = now, missingStreak reset; a closed job coming back becomes "חזרה";
 *  - missing from a *successful* run → missingStreak++, closed at CLOSE_AFTER_MISSES;
 *  - failed or suspicious run → the source's jobs are left untouched;
 *  - closed for longer than KEEP_CLOSED_MS → moved to the archive.
 */
export function mergeRun({ previousJobs, previousHealth, results, now }: MergeInput): MergeOutput {
  const nowIso = now.toISOString();
  const byId = new Map(previousJobs.map((j) => [j.id, { ...j }]));
  const health: MergeOutput['health'] = new Map();

  for (const result of results) {
    const prev = previousHealth.get(result.sourceId);
    const recentCounts = prev?.recentCounts ?? [];
    const baselineDone = prev?.baselineDone ?? false;
    // A drop that persists for 6 runs in a row is accepted as real (e.g. every position got filled).
    const acceptDrop = prev?.status === 'suspect' && (prev.consecutiveFailures ?? 0) >= 5;
    const suspicious = result.ok && !acceptDrop && isSuspiciousDrop(result.fetched, recentCounts);

    if (!result.ok || suspicious) {
      health.set(result.sourceId, {
        status: result.ok ? 'suspect' : 'error',
        error: result.ok
          ? `החזיר ${result.fetched} משרות לעומת חציון ${median(recentCounts)} — כנראה תקלה; המשרות לא סומנו כסגורות`
          : result.error,
        fetched: result.fetched,
        kept: result.jobs.length,
        lastRunAt: nowIso,
        lastSuccessAt: prev?.lastSuccessAt,
        consecutiveFailures: (prev?.consecutiveFailures ?? 0) + 1,
        baselineDone,
        recentCounts,
        durationMs: result.durationMs,
      });
      continue;
    }

    const isBaseline = !baselineDone;
    const seen = new Set<string>();
    for (const candidate of result.jobs) {
      seen.add(candidate.id);
      const existing = byId.get(candidate.id);
      if (!existing) {
        byId.set(candidate.id, {
          ...candidate,
          firstSeenAt: nowIso,
          lastSeenAt: nowIso,
          missingStreak: 0,
          state: 'active',
          baseline: isBaseline,
        });
        continue;
      }
      const reappeared = existing.state === 'closed';
      byId.set(candidate.id, {
        ...existing,
        ...candidate,
        firstSeenAt: existing.firstSeenAt,
        baseline: existing.baseline,
        lastSeenAt: nowIso,
        missingStreak: 0,
        state: 'active',
        closedAt: undefined,
        reappearedAt: reappeared ? nowIso : existing.reappearedAt,
      });
    }

    for (const job of byId.values()) {
      if (job.sourceId !== result.sourceId || seen.has(job.id) || job.state !== 'active') continue;
      job.missingStreak += 1;
      if (job.missingStreak >= CLOSE_AFTER_MISSES) {
        job.state = 'closed';
        job.closedAt = nowIso;
      }
    }

    health.set(result.sourceId, {
      status: 'ok',
      error: undefined,
      fetched: result.fetched,
      kept: result.jobs.length,
      lastRunAt: nowIso,
      lastSuccessAt: nowIso,
      consecutiveFailures: 0,
      baselineDone: true,
      // After accepting a persistent drop, start a fresh history so the new level becomes "normal".
      recentCounts: [...(acceptDrop ? [] : recentCounts), result.fetched].slice(-RECENT_COUNTS),
      durationMs: result.durationMs,
    });
  }

  const jobs: Job[] = [];
  const archived: Job[] = [];
  for (const job of byId.values()) {
    const expired = job.state === 'closed' && job.closedAt && now.getTime() - Date.parse(job.closedAt) > KEEP_CLOSED_MS;
    (expired ? archived : jobs).push(job);
  }
  jobs.sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt) || a.id.localeCompare(b.id));
  return { jobs, archived, health };
}
