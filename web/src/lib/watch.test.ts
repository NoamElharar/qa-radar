import { describe, expect, it } from 'vitest';
import { watchStatus } from './watch.ts';

const watch = [
  { key: 'a', firstSeenAt: '2026-10-01T08:00:00Z', baseline: true, score: 70 },
  { key: 'b', firstSeenAt: '2026-10-09T08:00:00Z', score: 84 },
  { key: 'c', firstSeenAt: '2026-10-10T08:00:00Z', score: 60 },
];

describe('watchStatus', () => {
  it('is undefined for plain link-out sources', () => {
    expect(watchStatus({})).toBeUndefined();
  });

  it('counts every QA job and the best score', () => {
    expect(watchStatus({ watch })).toMatchObject({ count: 3, best: 84 });
  });

  it('counts jobs that appeared since the last "בדקתי" — never the first-check baseline', () => {
    expect(watchStatus({ watch })?.fresh).toBe(2);
    expect(watchStatus({ watch }, '2026-10-09T12:00:00Z')?.fresh).toBe(1);
    expect(watchStatus({ watch }, '2026-10-10T12:00:00Z')?.fresh).toBe(0);
  });

  it('handles a source with no QA jobs right now', () => {
    expect(watchStatus({ watch: [] })).toEqual({ count: 0, fresh: 0, best: undefined });
  });
});
