import type { JobStatus, StatusEntry } from './storage.ts';

/**
 * When several saved entries belong to one job (a source re-published it under new ids), the most
 * meaningful one is shown: progress beats "לא רלוונטי" (often just a way to hide the daily repost),
 * which beats "נצפה" (set automatically when a posting is opened).
 */
const MERGE_RANK: Record<JobStatus, number> = {
  offer: 11,
  rejected: 10,
  awaiting_answer: 9,
  interview_frontal: 8,
  interview: 7,
  interview_video: 6,
  home_assignment: 5,
  recruiter_call: 4,
  applied: 3,
  saved: 2,
  irrelevant: 1,
  viewed: 0,
};

export interface ResolvedStatuses {
  /** The status of each job, keyed by its current id. */
  statuses: Record<string, StatusEntry>;
  /** Current id → every saved id that belongs to the job (old ids included). */
  members: Map<string, string[]>;
}

function mergeEntries(entries: StatusEntry[]): StatusEntry {
  if (entries.length === 1) return entries[0]!;
  const best = entries.reduce((a, b) =>
    MERGE_RANK[b.status] > MERGE_RANK[a.status] ||
    (MERGE_RANK[b.status] === MERGE_RANK[a.status] && b.updatedAt > a.updatedAt)
      ? b
      : a,
  );
  const appliedAt = entries.flatMap((e) => (e.appliedAt ? [e.appliedAt] : [])).sort()[0];
  const note = best.note ?? entries.find((e) => e.note?.trim())?.note;
  const pinned = entries.find((e) => e.pinned);
  return {
    ...best,
    ...(appliedAt ? { appliedAt } : {}),
    ...(note ? { note } : {}),
    ...(pinned ? { pinned: true, pinnedAt: pinned.pinnedAt } : {}),
  };
}

/**
 * Statuses as the dashboard shows them: entries saved under an old id of a job count for the job's
 * current id. An entry saved under the current id always wins (it is the latest explicit choice);
 * otherwise the old entries are merged (see MERGE_RANK). Display-only — saved data is not changed.
 */
export function resolveStatuses(
  saved: Record<string, StatusEntry>,
  aliases: Record<string, string> = {},
): ResolvedStatuses {
  const members = new Map<string, string[]>();
  for (const id of Object.keys(saved)) {
    const current = aliases[id] ?? id;
    members.set(current, [...(members.get(current) ?? []), id]);
  }
  const statuses: Record<string, StatusEntry> = {};
  for (const [current, ids] of members) {
    statuses[current] = saved[current] ?? mergeEntries(ids.map((id) => saved[id]!));
  }
  return { statuses, members };
}
