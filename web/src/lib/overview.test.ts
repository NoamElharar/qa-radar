import { describe, expect, it } from 'vitest';
import type { Job } from '@qa-radar/shared';
import { buildItems, type MineItem } from './mine.ts';
import { asOf, bars, greeting, inProcess, waitingForAnswer, weekLabel } from './overview.ts';
import type { JobStatus, StatusEntry } from './storage.ts';

// Thursday 12 Nov 2026, 12:00 Israel time.
const now = new Date('2026-11-12T10:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 864e5).toISOString();

const item = (id: string, status: JobStatus, updatedDaysAgo = 1, appliedDaysAgo = 20): MineItem => {
  const entry: StatusEntry = {
    status,
    appliedAt: daysAgo(appliedDaysAgo),
    updatedAt: daysAgo(updatedDaysAgo),
    snapshot: { title: id, url: 'https://x.test' },
  };
  return buildItems({ [id]: entry }, new Map())[0]!;
};

describe('greeting', () => {
  it.each([
    ['2026-11-12T03:30:00Z', 'בוקר טוב'], // 05:30 in Israel
    ['2026-11-12T09:59:00Z', 'בוקר טוב'], // 11:59
    ['2026-11-12T10:00:00Z', 'צהריים טובים'], // 12:00
    ['2026-11-12T15:00:00Z', 'ערב טוב'], // 17:00
    ['2026-11-12T20:00:00Z', 'לילה טוב'], // 22:00
    ['2026-11-12T01:00:00Z', 'לילה טוב'], // 03:00
  ])('%s → %s', (iso, expected) => {
    expect(greeting(new Date(iso))).toBe(expected);
  });
});

describe('asOf', () => {
  const job = (id: string, firstSeenDaysAgo: number, reappearedDaysAgo?: number) =>
    ({
      id,
      firstSeenAt: daysAgo(firstSeenDaysAgo),
      ...(reappearedDaysAgo !== undefined ? { reappearedAt: daysAgo(reappearedDaysAgo) } : {}),
    }) as Job;

  it('leaves out jobs first seen after the moment', () => {
    const at = new Date(daysAgo(1));
    expect(asOf([job('old', 3), job('today', 0.5)], at).map((j) => j.id)).toEqual(['old']);
  });

  it('forgets a comeback that only happened later, and keeps an earlier one', () => {
    const at = new Date(daysAgo(1));
    const [later, earlier] = asOf([job('later', 30, 0.5), job('earlier', 30, 1.5)], at);
    expect(later!.reappearedAt).toBeUndefined();
    expect(earlier!.reappearedAt).toBe(daysAgo(1.5));
  });
});

describe('inProcess', () => {
  it('keeps only moving applications, the furthest along first, then the latest update', () => {
    const items = [
      item('call-old', 'recruiter_call', 5),
      item('applied', 'applied'),
      item('frontal', 'interview_frontal', 3),
      item('call-new', 'recruiter_call', 1),
      item('rejected', 'rejected'),
      item('offer', 'offer', 9),
      item('saved', 'saved'),
    ];
    expect(inProcess(items).map((i) => i.id)).toEqual(['offer', 'frontal', 'call-new', 'call-old']);
  });
});

describe('waitingForAnswer', () => {
  it('counts "הגשתי" entries, and those waiting 14+ days', () => {
    const items = [
      item('fresh', 'applied', 3, 3),
      item('stale', 'applied', 20, 20),
      item('call', 'recruiter_call', 20, 20),
    ];
    expect(waitingForAnswer(items, now)).toEqual({ total: 2, stale: 1 });
  });
});

describe('the weekly pill chart', () => {
  it('sizes each week against the busiest one and fills the answered share', () => {
    expect(
      bars([
        { applications: 40, replied: 10 },
        { applications: 10, replied: 0 },
        { applications: 0, replied: 0 },
      ]),
    ).toEqual([
      { height: 1, fill: 0.25 },
      { height: 0.25, fill: 0 },
      { height: 0, fill: 0 },
    ]);
  });

  it('copes with no applications at all', () => {
    expect(bars([{ applications: 0, replied: 0 }])).toEqual([{ height: 0, fill: 0 }]);
    expect(bars([])).toEqual([]);
  });

  it('labels a week by its first day', () => {
    expect(weekLabel('2026-10-04')).toBe('4.10');
  });
});
