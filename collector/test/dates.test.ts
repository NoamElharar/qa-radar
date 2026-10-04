import { describe, expect, it } from 'vitest';
import { israelLocalToDate, israelParts, parseSourceDate } from '../src/pipeline/dates.ts';

// Sunday 4 Oct 2026, 11:00 Israel summer time (UTC+3).
const now = new Date('2026-10-04T08:00:00Z');

describe('parseSourceDate — Hebrew relative phrases', () => {
  it.each([
    ['לפני 3 שעות', '2026-10-04T05:00:00.000Z'],
    ['פורסם לפני שעה', '2026-10-04T07:00:00.000Z'],
    ['לפני שעתיים', '2026-10-04T06:00:00.000Z'],
    ['לפני 5 ימים', '2026-09-29T08:00:00.000Z'],
    ['לפני יומיים', '2026-10-02T08:00:00.000Z'],
    ['לפני שבוע', '2026-09-27T08:00:00.000Z'],
    ['לפני 20 דקות', '2026-10-04T07:40:00.000Z'],
    ['לפני שלושה ימים', '2026-10-01T08:00:00.000Z'],
  ])('%s', (raw, expected) => {
    expect(parseSourceDate(raw, now)).toBe(expected);
  });

  it('"היום" is now, "אתמול" is the start of yesterday in Israel', () => {
    expect(parseSourceDate('היום', now)).toBe(now.toISOString());
    expect(parseSourceDate('אתמול', now)).toBe('2026-10-02T21:00:00.000Z'); // 3 Oct 00:00 IDT
  });
});

describe('parseSourceDate — absolute dates', () => {
  it('reads Israeli day-first dates as Israel midnight (summer, UTC+3)', () => {
    expect(parseSourceDate('09/09/2026', now)).toBe('2026-09-08T21:00:00.000Z');
  });
  it('handles winter time (UTC+2)', () => {
    expect(parseSourceDate('15.01.2026', now)).toBe('2026-01-14T22:00:00.000Z');
  });
  it('treats naive ISO timestamps as Israel time', () => {
    expect(parseSourceDate('2026-09-23T16:48:41', now)).toBe('2026-09-23T13:48:00.000Z');
  });
  it('keeps zoned ISO and RFC-2822 (RSS) dates', () => {
    expect(parseSourceDate('2026-10-01T13:04:26.986Z', now)).toBe('2026-10-01T13:04:26.986Z');
    expect(parseSourceDate('Sun, 16 Nov 2025 10:09:22 +0000', now)).toBe('2025-11-16T10:09:22.000Z');
  });
  it('rejects sentinels, garbage and future dates', () => {
    expect(parseSourceDate('01/01/1900', now)).toBeUndefined();
    expect(parseSourceDate('בקרוב', now)).toBeUndefined();
    expect(parseSourceDate('31/12/2027', now)).toBeUndefined();
    expect(parseSourceDate('', now)).toBeUndefined();
    expect(parseSourceDate(undefined, now)).toBeUndefined();
  });
});

describe('Israel time helpers', () => {
  it('converts wall-clock time across DST', () => {
    expect(israelLocalToDate(2026, 7, 1, 9, 0).toISOString()).toBe('2026-07-01T06:00:00.000Z');
    expect(israelLocalToDate(2026, 12, 1, 9, 0).toISOString()).toBe('2026-12-01T07:00:00.000Z');
  });
  it('reports weekday and hour in Israel', () => {
    expect(israelParts(now)).toMatchObject({ weekday: 0, hour: 11, day: 4, month: 10 });
  });
});
