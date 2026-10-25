import { describe, expect, it } from 'vitest';
import type { Job } from '@qa-radar/shared';
import {
  applyMineFilters,
  buildItems,
  createManualEntry,
  DEFAULT_MINE_FILTERS,
  groupItems,
  isStale,
  mineFiltersFromParams,
  mineStats,
  visiblePipeline,
  weekStart,
  writeMineParams,
  type MineFilters,
} from './mine.ts';
import type { StatusEntry } from './storage.ts';

// Sunday 4 Oct 2026, 11:00 Israel time.
const now = new Date('2026-10-04T08:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 864e5).toISOString();

function entry(overrides: Partial<StatusEntry> = {}): StatusEntry {
  return {
    status: 'applied',
    updatedAt: daysAgo(1),
    appliedAt: daysAgo(1),
    snapshot: { title: 'QA', url: 'https://x.test' },
    ...overrides,
  };
}
const f = (o: Partial<MineFilters> = {}): MineFilters => ({ ...DEFAULT_MINE_FILTERS, ...o });
const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('buildItems', () => {
  it('uses the live job when present, otherwise the saved snapshot', () => {
    const job = {
      id: 'a',
      title: 'Live title',
      agency: 'SQLink',
      state: 'active',
      url: 'https://live.test',
    } as Job;
    const items = buildItems(
      {
        a: entry(),
        b: entry({ snapshot: { title: 'Old posting', company: 'Acme', url: 'https://old.test' } }),
      },
      new Map([['a', job]]),
    );
    expect(items[0]).toMatchObject({ title: 'Live title', company: 'SQLink', gone: false });
    expect(items[1]).toMatchObject({ title: 'Old posting', company: 'Acme', gone: true });
  });
});

describe('isStale', () => {
  it('flags applications with no news for 14+ days', () => {
    expect(isStale(entry({ appliedAt: daysAgo(20), updatedAt: daysAgo(20) }), now)).toBe(true);
    expect(isStale(entry({ appliedAt: daysAgo(10), updatedAt: daysAgo(10) }), now)).toBe(false);
  });
  it('a recent update (e.g. a note) resets the clock; only "הגשתי" can be stale', () => {
    expect(isStale(entry({ appliedAt: daysAgo(30), updatedAt: daysAgo(2) }), now)).toBe(false);
    expect(
      isStale(entry({ status: 'interview', appliedAt: daysAgo(30), updatedAt: daysAgo(30) }), now),
    ).toBe(false);
  });
});

describe('applyMineFilters', () => {
  const items = buildItems(
    {
      a: entry({
        status: 'applied',
        appliedAt: daysAgo(3),
        updatedAt: daysAgo(3),
        snapshot: { title: 'בודק/ת תוכנה', company: 'NESS', url: 'u' },
      }),
      b: entry({
        status: 'interview',
        appliedAt: daysAgo(40),
        updatedAt: daysAgo(1),
        note: 'ראיון ביום ג׳',
        snapshot: { title: 'QA Automation', company: 'Comblack', url: 'u' },
      }),
      c: entry({
        status: 'applied',
        appliedAt: daysAgo(25),
        updatedAt: daysAgo(25),
        pinned: true,
        pinnedAt: daysAgo(5),
        snapshot: { title: 'Manual QA', company: 'Abra', url: 'u' },
      }),
      d: entry({
        status: 'rejected',
        appliedAt: undefined,
        updatedAt: daysAgo(8),
        snapshot: { title: 'SDET', company: 'Wix', url: 'u' },
      }),
    },
    new Map(),
  );

  it('filters by status, flags, applied window and search (title, company, notes)', () => {
    expect(ids(applyMineFilters(items, f({ statuses: ['applied'] }), now)).sort()).toEqual([
      'a',
      'c',
    ]);
    expect(ids(applyMineFilters(items, f({ flags: ['pinned'] }), now))).toEqual(['c']);
    expect(ids(applyMineFilters(items, f({ flags: ['stale'] }), now))).toEqual(['c']);
    expect(ids(applyMineFilters(items, f({ flags: ['notes'] }), now))).toEqual(['b']);
    expect(ids(applyMineFilters(items, f({ applied: '7d' }), now))).toEqual(['a']);
    expect(ids(applyMineFilters(items, f({ q: 'בודקת' }), now))).toEqual(['a']);
    expect(ids(applyMineFilters(items, f({ q: 'ראיון' }), now))).toEqual(['b']);
    expect(ids(applyMineFilters(items, f({ q: 'wix' }), now))).toEqual(['d']);
  });

  it('sorts by update, application date, waiting time or company', () => {
    expect(ids(applyMineFilters(items, f({ sort: 'updated' }), now))).toEqual(['b', 'a', 'd', 'c']);
    expect(ids(applyMineFilters(items, f({ sort: 'applied' }), now))).toEqual(['a', 'c', 'b', 'd']);
    expect(ids(applyMineFilters(items, f({ sort: 'waiting' }), now))[0]).toBe('b');
    expect(ids(applyMineFilters(items, f({ sort: 'company' }), now))).toEqual(['c', 'b', 'a', 'd']);
  });

  it('groups pinned first, then by status in action order', () => {
    const { pinned, groups } = groupItems(applyMineFilters(items, f(), now));
    expect(ids(pinned)).toEqual(['c']);
    expect(groups.map((g) => g.status)).toEqual(['interview', 'applied', 'rejected']);
    expect(ids(groups[1]!.items)).toEqual(['a']);
  });
});

describe('mineStats', () => {
  it('summarises 250 applications without surprises', () => {
    const statuses: Record<string, StatusEntry> = {};
    for (let i = 0; i < 250; i++) {
      const status = i < 10 ? 'interview' : i < 12 ? 'offer' : i < 70 ? 'rejected' : 'applied';
      statuses[`j${i}`] = entry({ status, appliedAt: daysAgo(i % 60), updatedAt: daysAgo(i % 60) });
    }
    statuses.saved = entry({ status: 'saved', appliedAt: undefined });
    statuses.viewed = entry({ status: 'viewed', appliedAt: undefined });
    const s = mineStats(buildItems(statuses, new Map()), now);

    expect(s.applications).toBe(250);
    expect(s.interviews).toBe(12);
    expect(s.interviewRate).toBeCloseTo(12 / 250);
    expect(s.byStatus).toMatchObject({
      applied: 180,
      rejected: 58,
      interview: 10,
      offer: 2,
      saved: 1,
      viewed: 1,
    });
    expect(s.weekly).toHaveLength(8);
    expect(s.weekly.at(-1)?.week).toBe('2026-10-04');
    expect(s.weekly.reduce((sum, w) => sum + w.count, 0)).toBeLessThanOrEqual(250);
    expect(s.stale).toBeGreaterThan(0);
  });

  it('counts this week vs last week (weeks start on Sunday, Israel time)', () => {
    const s = mineStats(
      buildItems(
        {
          a: entry({ appliedAt: '2026-10-04T06:00:00Z' }),
          b: entry({ appliedAt: '2026-10-01T10:00:00Z' }),
          c: entry({ appliedAt: '2026-09-27T10:00:00Z' }),
        },
        new Map(),
      ),
      now,
    );
    expect(s.appliedThisWeek).toBe(1);
    expect(s.appliedLastWeek).toBe(2);
  });

  it('weekStart uses the Israel calendar (Saturday 23:30 UTC is already Sunday in Israel)', () => {
    expect(weekStart(new Date('2026-10-03T23:30:00Z'))).toBe('2026-10-04');
    expect(weekStart(new Date('2026-10-03T12:00:00Z'))).toBe('2026-09-27');
  });
});

describe('URL state for "שלי"', () => {
  it('round-trips and keeps unrelated params (view=mine)', () => {
    const filters = f({
      q: 'API',
      statuses: ['applied', 'interview'],
      flags: ['stale'],
      applied: '30d',
      sort: 'waiting',
    });
    const params = writeMineParams(new URLSearchParams('view=mine'), filters);
    expect(params.get('view')).toBe('mine');
    expect(mineFiltersFromParams(params)).toEqual(filters);
  });
  it('drops junk values and writes nothing for defaults', () => {
    expect(
      mineFiltersFromParams(new URLSearchParams('ms=applied,zzz&mf=bogus&mt=1y&msort=x')),
    ).toEqual(f({ statuses: ['applied'] }));
    expect(writeMineParams(new URLSearchParams('view=mine'), DEFAULT_MINE_FILTERS).toString()).toBe(
      'view=mine',
    );
  });
});

describe('recruiter calls, home assignments and interview formats', () => {
  const items = buildItems(
    {
      call: entry({ status: 'recruiter_call', updatedAt: daysAgo(3) }),
      home: entry({ status: 'home_assignment', interviewFormat: 'teams', updatedAt: daysAgo(2) }),
      zoom: entry({ status: 'interview', interviewFormat: 'zoom', updatedAt: daysAgo(1) }),
      plain: entry({ status: 'applied' }),
    },
    new Map(),
  );

  it('count as applications and sit between "הגשתי" and "ראיון" in the list', () => {
    const stats = mineStats(items, now);
    expect(stats.byStatus.recruiter_call).toBe(1);
    expect(stats.byStatus.home_assignment).toBe(1);
    expect(stats.applications).toBe(4);
    expect(groupItems(items).groups.map((g) => g.status)).toEqual([
      'interview',
      'home_assignment',
      'recruiter_call',
      'applied',
    ]);
  });

  it('filter by status', () => {
    expect(ids(applyMineFilters(items, f({ statuses: ['recruiter_call'] }), now))).toEqual(['call']);
    expect(ids(applyMineFilters(items, f({ statuses: ['home_assignment'] }), now))).toEqual(['home']);
  });

  it('filter by interview format (several at once; "לא ידוע" = no format set)', () => {
    expect(ids(applyMineFilters(items, f({ formats: ['zoom'] }), now))).toEqual(['zoom']);
    expect(ids(applyMineFilters(items, f({ formats: ['zoom', 'teams'] }), now))).toEqual(['zoom', 'home']);
    expect(ids(applyMineFilters(items, f({ formats: ['unknown'] }), now))).toEqual(['plain', 'call']);
  });

  it('count each interview format', () => {
    expect(mineStats(items, now).byFormat).toEqual({ zoom: 1, teams: 1, meet: 0, frontal: 0, unknown: 2 });
  });

  it('keep the format filter in the URL', () => {
    const filters = f({ statuses: ['recruiter_call', 'home_assignment'], formats: ['zoom', 'teams'] });
    const params = writeMineParams(new URLSearchParams('view=mine'), filters);
    expect(params.get('mi')).toBe('zoom,teams');
    expect(mineFiltersFromParams(params)).toEqual(filters);
    expect(mineFiltersFromParams(new URLSearchParams('mi=zoom,skype'))).toEqual(f({ formats: ['zoom'] }));
  });

  it('a manual application can carry a format ("לא ידוע" is not stored)', () => {
    const base = { title: 'QA', status: 'interview' as const };
    const zoom = createManualEntry({ ...base, interviewFormat: 'zoom' }, now);
    const unknown = createManualEntry({ ...base, interviewFormat: 'unknown' }, now);
    expect('entry' in zoom && zoom.entry.interviewFormat).toBe('zoom');
    expect('entry' in unknown && 'interviewFormat' in unknown.entry).toBe(false);
  });
});

describe('the interview split (video → frontal → waiting for the answer)', () => {
  const items = buildItems(
    {
      video: entry({ status: 'interview_video' }),
      frontal: entry({ status: 'interview_frontal' }),
      waiting: entry({ status: 'awaiting_answer' }),
      legacy: entry({ status: 'interview' }),
      applied: entry({ status: 'applied' }),
    },
    new Map(),
  );

  it('every interview stage counts as "זימון לראיון" and as an application', () => {
    const stats = mineStats(items, now);
    expect(stats.interviews).toBe(4); // video, frontal, waiting, old "ראיון"
    expect(stats.applications).toBe(5);
    expect(stats.byStatus.awaiting_answer).toBe(1);
  });

  it('lists the most advanced first: waiting, frontal, video, then the old "ראיון"', () => {
    expect(groupItems(items).groups.map((g) => g.status)).toEqual([
      'awaiting_answer',
      'interview_frontal',
      'interview_video',
      'interview',
      'applied',
    ]);
  });

  it('shows the old "ראיון" chip only while some entry still has it', () => {
    const withLegacy = visiblePipeline(mineStats(items, now).byStatus);
    expect(withLegacy).toContain('interview');
    const without = visiblePipeline(mineStats(items.filter((i) => i.id !== 'legacy'), now).byStatus);
    expect(without).not.toContain('interview');
    expect(without.slice(4)).toEqual(['interview_video', 'interview_frontal', 'awaiting_answer', 'offer']);
  });

  it('the new statuses can be filtered and kept in the URL', () => {
    expect(ids(applyMineFilters(items, f({ statuses: ['awaiting_answer'] }), now))).toEqual(['waiting']);
    const params = writeMineParams(new URLSearchParams(), f({ statuses: ['interview_frontal', 'interview'] }));
    expect(mineFiltersFromParams(params).statuses).toEqual(['interview_frontal', 'interview']);
  });
});

describe('manual applications', () => {
  it('builds an entry from the form, defaulting the date for "הגשתי"', () => {
    const made = createManualEntry(
      { title: '  QA Engineer  ', company: 'Acme', channel: 'LinkedIn', status: 'applied' },
      now,
    );
    if ('error' in made) throw new Error(made.error);
    expect(made.id).toMatch(/^manual:/);
    expect(made.entry).toMatchObject({
      status: 'applied',
      appliedAt: now.toISOString(),
      manual: true,
      channel: 'LinkedIn',
      snapshot: { title: 'QA Engineer', company: 'Acme', url: '' },
    });
  });

  it('uses the chosen application date (Israel noon) and keeps "saved" undated', () => {
    const dated = createManualEntry(
      { title: 'QA', status: 'applied', appliedDate: '2026-09-20' },
      now,
    );
    const saved = createManualEntry({ title: 'QA', status: 'saved' }, now);
    expect('entry' in dated && dated.entry.appliedAt?.slice(0, 10)).toBe('2026-09-20');
    expect('entry' in saved && saved.entry.appliedAt).toBeUndefined();
  });

  it('rejects a missing title or a non-web link', () => {
    expect(createManualEntry({ title: '   ', status: 'applied' }, now)).toEqual({
      error: expect.any(String) as string,
    });
    expect(
      createManualEntry({ title: 'QA', url: 'javascript:alert(1)', status: 'applied' }, now),
    ).toEqual({ error: expect.any(String) as string });
    expect(
      'entry' in
        createManualEntry(
          { title: 'QA', url: 'https://jobs.example.com/1', status: 'applied' },
          now,
        ),
    ).toBe(true);
  });

  it('is never marked as "removed from the source", and can be filtered and searched by channel', () => {
    const made = createManualEntry(
      { title: 'Manual QA', channel: 'חבר מביא חבר', status: 'applied' },
      now,
    );
    if ('error' in made) throw new Error(made.error);
    const items = buildItems({ [made.id]: made.entry, other: entry() }, new Map());
    expect(items.find((i) => i.id === made.id)?.gone).toBe(false);
    expect(ids(applyMineFilters(items, f({ flags: ['manual'] }), now))).toEqual([made.id]);
    expect(ids(applyMineFilters(items, f({ q: 'חבר מביא' }), now))).toEqual([made.id]);
  });
});
