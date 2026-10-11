import type { SourceHealth } from '@qa-radar/shared';

export interface WatchStatus {
  /** QA-relevant jobs listed at the source right now. */
  count: number;
  /** Of those, how many appeared since the user last tapped "בדקתי" (all non-baseline ones if never). */
  fresh: number;
  /** Highest match score among them. */
  best?: number;
}

/** What a watch-mode link-out source currently has, for the "check manually" panel. */
export function watchStatus(source: Pick<SourceHealth, 'watch'>, checkedAt?: string): WatchStatus | undefined {
  if (!source.watch) return undefined;
  const since = checkedAt ? Date.parse(checkedAt) : -Infinity;
  const fresh = source.watch.filter((w) => !w.baseline && Date.parse(w.firstSeenAt) > since).length;
  const scores = source.watch.flatMap((w) => (typeof w.score === 'number' ? [w.score] : []));
  return { count: source.watch.length, fresh, best: scores.length ? Math.max(...scores) : undefined };
}
