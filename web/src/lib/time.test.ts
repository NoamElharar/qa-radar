import { describe, expect, it } from 'vitest';
import { israelDayKey, relativeTime } from './time.ts';

const now = new Date('2026-10-04T08:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const H = 3600000;
const D = 24 * H;

describe('relativeTime (Hebrew)', () => {
  it('never shows the ICU dual-form count "(2)"', () => {
    for (const ms of [2 * H, 14 * D, 60 * D]) expect(relativeTime(ago(ms), now)).not.toMatch(/\(\d+\)/);
  });
  it('picks a readable unit for the distance', () => {
    expect(relativeTime(ago(30 * 1000), now)).toBe('עכשיו');
    expect(relativeTime(ago(5 * 60000), now)).toMatch(/דקות/);
    expect(relativeTime(ago(3 * H), now)).toMatch(/3 שעות/);
    expect(relativeTime(ago(10 * D), now)).toMatch(/10 ימים/);
    expect(relativeTime(ago(21 * D), now)).toMatch(/3 שבועות/);
    expect(relativeTime(ago(90 * D), now)).toMatch(/3 חודשים/);
  });
  it('returns an empty string for missing dates', () => {
    expect(relativeTime(undefined, now)).toBe('');
  });
});

describe('israelDayKey', () => {
  it('uses the Israel calendar day', () => {
    expect(israelDayKey(new Date('2026-10-03T22:30:00Z'))).toBe('2026-10-04');
  });
});
