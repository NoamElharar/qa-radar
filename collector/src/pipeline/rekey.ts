import type { Job } from '@qa-radar/shared';
import type { SourceConfig } from '../config.ts';
import { contentKey } from './ids.ts';

export interface RekeyRule {
  sourceId: string;
  /** The job's stable id, or undefined to leave it alone. */
  keyOf: (job: Job) => string | undefined;
}

/** Rules for the sources that declare a stable identity (`idFromUrl` / `idFromContent`). */
export function rekeyRules(sources: SourceConfig[]): RekeyRule[] {
  return sources.flatMap((s): RekeyRule[] => {
    if (s.idFromContent) return [{ sourceId: s.id, keyOf: (job) => contentKey(job.title, job.snippet) }];
    if (s.idFromUrl) {
      const pattern = new RegExp(s.idFromUrl);
      return [{ sourceId: s.id, keyOf: (job) => pattern.exec(job.url)?.[1] }];
    }
    return [];
  });
}

/** One job out of the copies a source re-published under different ids. */
function foldCopies(copies: Job[]): Job {
  const latest = (list: Job[]) => list.reduce((a, b) => (b.lastSeenAt > a.lastSeenAt ? b : a));
  const active = copies.filter((c) => c.state === 'active');
  const primary = latest(active.length ? active : copies);
  const first = copies.reduce((a, b) => (b.firstSeenAt < a.firstSeenAt ? b : a));
  const { reappearedAt: _reappeared, ...rest } = primary;
  return {
    ...rest,
    firstSeenAt: first.firstSeenAt,
    baseline: first.baseline,
    lastSeenAt: latest(copies).lastSeenAt,
    ...(active.length ? { state: 'active' as const, closedAt: undefined } : {}),
  };
}

/**
 * Give jobs of `idFromUrl` / `idFromContent` sources their stable id and fold the copies a source
 * re-published under new ids into one job: the earliest first-seen date (so a repost is never "new"),
 * active if any copy is. Every replaced id is recorded in `aliases` so statuses saved under it follow
 * the job.
 * Idempotent: once a source's ids follow the rule, nothing changes.
 */
export function rekeyJobs(
  jobs: Job[],
  aliases: Record<string, string>,
  rules: RekeyRule[],
): { jobs: Job[]; aliases: Record<string, string> } {
  if (!rules.length) return { jobs, aliases };
  const keyFor = new Map(rules.map((r) => [r.sourceId, r.keyOf]));
  const nextAliases = { ...aliases };
  const groups = new Map<string, Job[]>();
  const out: Job[] = [];

  for (const job of jobs) {
    const key = keyFor.get(job.sourceId)?.(job);
    if (!key) {
      out.push(job);
      continue;
    }
    const id = `${job.sourceId}:${key}`;
    if (job.id !== id) nextAliases[job.id] = id;
    const group = groups.get(id) ?? [];
    group.push({ ...job, id, sourceJobId: key });
    groups.set(id, group);
  }
  for (const copies of groups.values()) out.push(copies.length === 1 ? copies[0]! : foldCopies(copies));

  // Keep every alias pointing at a current id (an id that was itself replaced later).
  for (const [from, to] of Object.entries(nextAliases)) nextAliases[from] = nextAliases[to] ?? to;
  return { jobs: out, aliases: nextAliases };
}
