import { describe, expect, it } from 'vitest';
import { resolveStatuses } from './aliases.ts';
import type { StatusEntry } from './storage.ts';

const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T09:00:00.000Z`;
const entry = (status: StatusEntry['status'], day: number, extra: Partial<StatusEntry> = {}): StatusEntry => ({
  status,
  updatedAt: at(day),
  ...extra,
});

// Comblack re-published one job daily; it now has the stable id comblack:25288.
const aliases = {
  'comblack:443186': 'comblack:25288',
  'comblack:443489': 'comblack:25288',
  'comblack:443809': 'comblack:25288',
};

describe('resolveStatuses', () => {
  it('without aliases, statuses are unchanged', () => {
    const saved = { 'ness:1': entry('applied', 5) };
    expect(resolveStatuses(saved).statuses).toEqual(saved);
  });

  it('"הגשתי" on the first copy beats the daily "לא רלוונטי" on later copies', () => {
    const saved = {
      'comblack:443186': entry('applied', 4, { appliedAt: at(4), note: 'שלחתי קו"ח' }),
      'comblack:443489': entry('irrelevant', 5),
      'comblack:443809': entry('irrelevant', 6),
    };
    const { statuses, members } = resolveStatuses(saved, aliases);
    expect(Object.keys(statuses)).toEqual(['comblack:25288']); // one row in "שלי"
    expect(statuses['comblack:25288']).toMatchObject({ status: 'applied', appliedAt: at(4), note: 'שלחתי קו"ח' });
    expect(members.get('comblack:25288')).toHaveLength(3);
  });

  it('a status saved under the current id always wins', () => {
    const saved = {
      'comblack:443186': entry('applied', 4),
      'comblack:25288': entry('rejected', 10),
    };
    expect(resolveStatuses(saved, aliases).statuses['comblack:25288']?.status).toBe('rejected');
  });

  it('keeps the earliest application date and a pin from any copy', () => {
    const saved = {
      'comblack:443186': entry('saved', 4, { pinned: true, pinnedAt: at(4) }),
      'comblack:443489': entry('interview', 8, { appliedAt: at(6) }),
      'comblack:443809': entry('applied', 6, { appliedAt: at(5) }),
    };
    expect(resolveStatuses(saved, aliases).statuses['comblack:25288']).toMatchObject({
      status: 'interview',
      appliedAt: at(5),
      pinned: true,
    });
  });
});
