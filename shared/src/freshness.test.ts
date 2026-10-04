import { describe, expect, it } from 'vitest';
import { badgeFor, isNewSince } from './freshness.ts';

const now = new Date('2026-10-04T08:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const job = (overrides: Partial<Parameters<typeof badgeFor>[0]> = {}) => ({
  state: 'active' as const,
  firstSeenAt: hoursAgo(2),
  baseline: false,
  ...overrides,
});

describe('badgeFor', () => {
  it('"חדש" for jobs first seen within 24h', () => {
    expect(badgeFor(job({ firstSeenAt: hoursAgo(23) }), now)).toBe('new');
  });
  it('"טרי" between 24h and 72h', () => {
    expect(badgeFor(job({ firstSeenAt: hoursAgo(30) }), now)).toBe('fresh');
  });
  it('no badge after 72h', () => {
    expect(badgeFor(job({ firstSeenAt: hoursAgo(80) }), now)).toBeNull();
  });
  it('baseline jobs (first run of a source) never get "חדש"', () => {
    expect(badgeFor(job({ baseline: true }), now)).toBeNull();
  });
  it('"חזרה" for recently reappeared jobs — even baseline ones', () => {
    expect(badgeFor(job({ baseline: true, firstSeenAt: hoursAgo(500), reappearedAt: hoursAgo(5) }), now)).toBe('back');
  });
  it('"נסגרה" wins over everything', () => {
    expect(badgeFor(job({ state: 'closed', reappearedAt: hoursAgo(1) }), now)).toBe('closed');
  });
});

describe('isNewSince', () => {
  const lastVisit = new Date(hoursAgo(10));
  it('counts non-baseline jobs first seen after the last visit', () => {
    expect(isNewSince(job({ firstSeenAt: hoursAgo(3) }), lastVisit)).toBe(true);
    expect(isNewSince(job({ firstSeenAt: hoursAgo(12) }), lastVisit)).toBe(false);
  });
  it('ignores baseline and closed jobs', () => {
    expect(isNewSince(job({ baseline: true }), lastVisit)).toBe(false);
    expect(isNewSince(job({ state: 'closed' }), lastVisit)).toBe(false);
  });
  it('counts jobs that came back after the last visit', () => {
    expect(isNewSince(job({ firstSeenAt: hoursAgo(300), reappearedAt: hoursAgo(1) }), lastVisit)).toBe(true);
  });
});
