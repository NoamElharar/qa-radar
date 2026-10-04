import { describe, expect, it } from 'vitest';
import type { Job, SourceHealth } from '@qa-radar/shared';
import type { JobCandidate } from '../src/pipeline/normalize.ts';
import { CLOSE_AFTER_MISSES, isSuspiciousDrop, mergeRun, type SourceRunResult } from '../src/pipeline/state.ts';

const T0 = new Date('2026-10-04T05:00:00Z');
const hours = (h: number) => new Date(T0.getTime() + h * 3600000);

function candidate(sourceId: string, n: number): JobCandidate {
  return {
    id: `${sourceId}:${n}`,
    sourceId,
    sourceJobId: String(n),
    url: `https://example.test/${sourceId}/${n}`,
    title: `QA Engineer ${n}`,
    regions: ['center'],
    tags: [],
    seniority: 'mid',
    score: 70,
    matched: [],
    missing: [],
  };
}

const ok = (sourceId: string, ids: number[], fetched = ids.length): SourceRunResult => ({
  sourceId,
  ok: true,
  fetched,
  jobs: ids.map((n) => candidate(sourceId, n)),
});
const failed = (sourceId: string): SourceRunResult => ({ sourceId, ok: false, error: 'HTTP 503', fetched: 0, jobs: [] });

/** Runs a sequence of results through mergeRun, carrying state forward like the real collector. */
function simulate(steps: Array<{ at: Date; results: SourceRunResult[] }>) {
  let jobs: Job[] = [];
  let health = new Map<string, SourceHealth>();
  let archived: Job[] = [];
  for (const step of steps) {
    const out = mergeRun({ previousJobs: jobs, previousHealth: health, results: step.results, now: step.at });
    jobs = out.jobs;
    archived = archived.concat(out.archived);
    const next = new Map(health);
    for (const [id, h] of out.health) next.set(id, { ...(health.get(id) ?? ({} as SourceHealth)), ...h, id } as SourceHealth);
    health = next;
  }
  return { jobs, health, archived, byId: (id: string) => jobs.find((j) => j.id === id) };
}

describe('mergeRun — new jobs and baseline', () => {
  it("a source's first successful run is a silent baseline", () => {
    const { jobs, health } = simulate([{ at: T0, results: [ok('a', [1, 2])] }]);
    expect(jobs.map((j) => j.baseline)).toEqual([true, true]);
    expect(health.get('a')?.baselineDone).toBe(true);
  });

  it('jobs appearing on later runs are new (not baseline) with firstSeenAt = run time', () => {
    const { byId } = simulate([
      { at: T0, results: [ok('a', [1])] },
      { at: hours(1), results: [ok('a', [1, 2])] },
    ]);
    expect(byId('a:2')).toMatchObject({ baseline: false, firstSeenAt: hours(1).toISOString() });
    expect(byId('a:1')).toMatchObject({ baseline: true, firstSeenAt: T0.toISOString(), lastSeenAt: hours(1).toISOString() });
  });

  it('a failed first run does not consume the baseline', () => {
    const { jobs } = simulate([
      { at: T0, results: [failed('a')] },
      { at: hours(1), results: [ok('a', [1])] },
    ]);
    expect(jobs[0]?.baseline).toBe(true);
  });
});

describe('mergeRun — closing and reappearing', () => {
  it(`closes a job only after ${CLOSE_AFTER_MISSES} consecutive successful runs without it`, () => {
    const steps = [{ at: T0, results: [ok('a', [1, 2])] }];
    for (let i = 1; i < CLOSE_AFTER_MISSES; i++) steps.push({ at: hours(i), results: [ok('a', [1])] });
    expect(simulate(steps).byId('a:2')).toMatchObject({ state: 'active', missingStreak: CLOSE_AFTER_MISSES - 1 });

    steps.push({ at: hours(CLOSE_AFTER_MISSES), results: [ok('a', [1])] });
    expect(simulate(steps).byId('a:2')).toMatchObject({ state: 'closed', closedAt: hours(CLOSE_AFTER_MISSES).toISOString() });
  });

  it('a failing source never closes its jobs', () => {
    const { byId, health } = simulate([
      { at: T0, results: [ok('a', [1])] },
      { at: hours(1), results: [failed('a')] },
      { at: hours(2), results: [failed('a')] },
      { at: hours(3), results: [failed('a')] },
      { at: hours(4), results: [failed('a')] },
    ]);
    expect(byId('a:1')).toMatchObject({ state: 'active', missingStreak: 0, lastSeenAt: T0.toISOString() });
    expect(health.get('a')).toMatchObject({ status: 'error', consecutiveFailures: 4, error: 'HTTP 503' });
  });

  it('a closed job that shows up again is marked as back ("חזרה")', () => {
    const { byId } = simulate([
      { at: T0, results: [ok('a', [1, 2])] },
      { at: hours(1), results: [ok('a', [1])] },
      { at: hours(2), results: [ok('a', [1])] },
      { at: hours(3), results: [ok('a', [1])] },
      { at: hours(4), results: [ok('a', [1, 2])] },
    ]);
    expect(byId('a:2')).toMatchObject({ state: 'active', reappearedAt: hours(4).toISOString(), missingStreak: 0 });
    expect(byId('a:2')?.closedAt).toBeUndefined();
    expect(byId('a:2')?.firstSeenAt).toBe(T0.toISOString());
  });

  it('archives jobs closed for more than 14 days', () => {
    const { jobs, archived } = simulate([
      { at: T0, results: [ok('a', [1, 2])] },
      { at: hours(1), results: [ok('a', [1])] },
      { at: hours(2), results: [ok('a', [1])] },
      { at: hours(3), results: [ok('a', [1])] },
      { at: hours(3 + 15 * 24), results: [ok('a', [1])] },
    ]);
    expect(jobs.map((j) => j.id)).toEqual(['a:1']);
    expect(archived.map((j) => j.id)).toEqual(['a:2']);
  });

  it("only touches the jobs of the sources that ran", () => {
    const { byId } = simulate([
      { at: T0, results: [ok('a', [1]), ok('b', [1])] },
      { at: hours(1), results: [ok('a', [])] },
      { at: hours(2), results: [ok('a', [])] },
      { at: hours(3), results: [ok('a', [])] },
    ]);
    expect(byId('b:1')).toMatchObject({ state: 'active', missingStreak: 0 });
  });
});

describe('mergeRun — suspicious drops', () => {
  it('flags a sudden drop to zero as suspect and keeps the jobs open', () => {
    const steps = [0, 1, 2].map((h) => ({ at: hours(h), results: [ok('a', [1, 2, 3])] }));
    steps.push({ at: hours(3), results: [ok('a', [], 0)] }, { at: hours(4), results: [ok('a', [], 0)] }, { at: hours(5), results: [ok('a', [], 0)] });
    const { jobs, health } = simulate(steps);
    expect(jobs.every((j) => j.state === 'active' && j.missingStreak === 0)).toBe(true);
    expect(health.get('a')).toMatchObject({ status: 'suspect', consecutiveFailures: 3 });
  });

  it('accepts the drop as real on the 6th run in a row, then closes jobs normally', () => {
    const steps = [0, 1, 2].map((h) => ({ at: hours(h), results: [ok('a', [1])] }));
    for (let h = 3; h < 3 + 6 + CLOSE_AFTER_MISSES; h++) steps.push({ at: hours(h), results: [ok('a', [], 0)] });
    expect(simulate(steps).byId('a:1')?.state).toBe('closed');
  });

  it.each([
    [0, [20, 21, 19], true],
    [5, [20, 21, 19], true],
    [15, [20, 21, 19], false],
    [0, [0, 0, 0], false],
    [0, [], false],
    [1, [3, 2, 3], false],
  ])('isSuspiciousDrop(%i, %j) → %s', (fetched, recent, expected) => {
    expect(isSuspiciousDrop(fetched, recent)).toBe(expected);
  });
});
