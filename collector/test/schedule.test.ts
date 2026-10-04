import { describe, expect, it } from 'vitest';
import { isSourceDue, shouldRunAt } from '../src/schedule.ts';
import type { SourceConfig } from '../src/config.ts';

describe('shouldRunAt (Israel time, DST-aware)', () => {
  it.each([
    ['2026-10-04T04:17:00Z', true, 'Sunday 07:17 IDT — first workday run'],
    ['2026-10-04T03:17:00Z', true, 'Sunday 06:17 IDT — 3-hour slot'],
    ['2026-10-04T02:17:00Z', false, 'Sunday 05:17 IDT — off-hours'],
    ['2026-10-08T18:17:00Z', true, 'Thursday 21:17 IDT — last workday run'],
    ['2026-10-08T19:17:00Z', false, 'Thursday 22:17 IDT — off-hours'],
    ['2026-10-09T07:17:00Z', false, 'Friday 10:17 IDT — weekend, not a 3h slot'],
    ['2026-10-09T06:17:00Z', true, 'Friday 09:17 IDT — weekend 3h slot'],
    ['2026-12-06T05:17:00Z', true, 'Sunday 07:17 IST (winter, UTC+2)'],
    ['2026-12-06T04:17:00Z', true, 'Sunday 06:17 IST — 3-hour slot'],
    ['2026-12-06T03:17:00Z', false, 'Sunday 05:17 IST — off-hours'],
  ])('%s → %s (%s)', (iso, expected) => {
    expect(shouldRunAt(new Date(iso)).run).toBe(expected);
  });
});

describe('isSourceDue', () => {
  const source = { everyHours: 6 } as SourceConfig;
  const now = new Date('2026-10-04T12:00:00Z');
  it('runs sources that never ran', () => {
    expect(isSourceDue(source, undefined, now)).toBe(true);
  });
  it('waits `everyHours` between runs, with slack for cron drift', () => {
    const health = (hoursAgo: number) => ({ lastRunAt: new Date(now.getTime() - hoursAgo * 3600000).toISOString() }) as never;
    expect(isSourceDue(source, health(5), now)).toBe(false);
    expect(isSourceDue(source, health(5.8), now)).toBe(true);
  });
});
