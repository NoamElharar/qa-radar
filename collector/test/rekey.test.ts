import { describe, expect, it } from 'vitest';
import type { Job } from '@qa-radar/shared';
import { loadConfig, sourceSchema } from '../src/config.ts';
import { createClassifier } from '../src/pipeline/classify.ts';
import { normalizeJobs } from '../src/pipeline/normalize.ts';
import { rekeyJobs } from '../src/pipeline/rekey.ts';

const rules = [{ sourceId: 'comblack', pattern: /position-(\d+)/ }];

function copy(postId: number, position: number, day: number, extra: Partial<Job> = {}): Job {
  return {
    id: `comblack:${postId}`,
    sourceId: 'comblack',
    sourceJobId: String(postId),
    url: `https://comblack.test/careers/position-${position}/`,
    title: 'בודק/ת תוכנה QA',
    regions: ['center'],
    tags: [],
    seniority: 'mid',
    score: 70,
    matched: [],
    missing: [],
    firstSeenAt: `2026-10-${String(day).padStart(2, '0')}T08:00:00.000Z`,
    lastSeenAt: `2026-10-${String(day + 1).padStart(2, '0')}T08:00:00.000Z`,
    missingStreak: 0,
    state: 'closed',
    closedAt: `2026-10-${String(day + 1).padStart(2, '0')}T09:00:00.000Z`,
    baseline: false,
    ...extra,
  };
}

describe('rekeyJobs — a source that re-publishes the same job under new ids', () => {
  const daily = [
    copy(443186, 25288, 4, { baseline: true }),
    copy(443489, 25288, 5),
    copy(444709, 25288, 17, { state: 'active', closedAt: undefined, lastSeenAt: '2026-10-18T05:00:00.000Z', score: 74 }),
  ];
  const other: Job = { ...copy(1, 1, 4), id: 'ness:9', sourceId: 'ness', url: 'https://ness.test/9' };

  it('folds the daily copies into one job with the stable id and the first-seen date', () => {
    const { jobs, aliases } = rekeyJobs([...daily, other], {}, rules);
    const folded = jobs.find((j) => j.sourceId === 'comblack')!;
    expect(jobs).toHaveLength(2);
    expect(folded).toMatchObject({
      id: 'comblack:25288',
      sourceJobId: '25288',
      state: 'active',
      firstSeenAt: '2026-10-04T08:00:00.000Z', // a repost is never "new"
      baseline: true,
      lastSeenAt: '2026-10-18T05:00:00.000Z',
      score: 74, // the live copy's details
    });
    expect(folded.closedAt).toBeUndefined();
    expect(aliases).toEqual({
      'comblack:443186': 'comblack:25288',
      'comblack:443489': 'comblack:25288',
      'comblack:444709': 'comblack:25288',
    });
    expect(jobs).toContainEqual(other); // other sources are untouched
  });

  it('is idempotent and keeps aliases pointing at current ids', () => {
    const once = rekeyJobs(daily, { 'comblack:111': 'comblack:443186' }, rules);
    const twice = rekeyJobs(once.jobs, once.aliases, rules);
    expect(twice.jobs).toEqual(once.jobs);
    expect(twice.aliases['comblack:111']).toBe('comblack:25288');
  });

  it('a position that is gone stays closed', () => {
    const { jobs } = rekeyJobs([copy(1, 21000, 4), copy(2, 21000, 5)], {}, rules);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: 'comblack:21000', state: 'closed', closedAt: '2026-10-06T09:00:00.000Z' });
  });

  it('new collections use the URL number as the id (sources.yaml idFromUrl)', () => {
    const source = sourceSchema.parse({
      id: 'comblack',
      name: 'Comblack',
      type: 'agency',
      tier: 'A',
      adapter: 'wp-rest',
      homepage: 'https://comblack.test/career/',
      idFromUrl: 'position-(\\d+)',
    });
    const { kept } = normalizeJobs(
      [{ sourceJobId: '444709', title: 'בודק/ת תוכנה QA', url: 'https://comblack.test/careers/position-25288/' }],
      source,
      createClassifier(loadConfig()),
      new Date(),
    );
    expect(kept[0]?.id).toBe('comblack:25288');
  });
});
