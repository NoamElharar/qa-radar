import { describe, expect, it } from 'vitest';
import type { Job } from '@qa-radar/shared';
import { buildItems, type MineItem } from './mine.ts';
import {
  bySubmitter,
  collectFacts,
  computeStats,
  factsOf,
  rate,
  submitterName,
  weeklyCohorts,
  type AppFacts,
} from './stats.ts';
import type { StatusEntry, StatusStep } from './storage.ts';

// Thursday 12 Nov 2026, 12:00 Israel time.
const now = new Date('2026-11-12T10:00:00Z');
const daysAgo = (d: number, hour = 10) => {
  const t = new Date(now.getTime() - d * 864e5);
  t.setUTCHours(hour);
  return t.toISOString();
};

function entry(overrides: Partial<StatusEntry> = {}): StatusEntry {
  return {
    status: 'applied',
    appliedAt: daysAgo(20),
    updatedAt: daysAgo(20),
    snapshot: { title: 'QA', url: 'https://x.test' },
    ...overrides,
  };
}
const steps = (...list: Array<[StatusStep['status'], number, true?]>): StatusStep[] =>
  list.map(([status, d, estimated]) => ({
    status,
    at: daysAgo(d),
    ...(estimated ? { estimated } : {}),
  }));
const item = (id: string, e: StatusEntry, job?: Job): MineItem =>
  buildItems({ [id]: e }, new Map(job ? [[id, job]] : []))[0]!;

/** An application's facts with every stage it reached, for the counting tests. */
function fact(
  overrides: Omit<Partial<AppFacts>, 'reached'> & { reached?: Partial<AppFacts['reached']> } = {},
): AppFacts {
  const { reached, ...rest } = overrides;
  return {
    id: 'x',
    appliedAt: daysAgo(20),
    submitter: 'NESS',
    manual: false,
    homeAssignment: false,
    frontal: false,
    rejected: false,
    inProcess: false,
    replyDateEstimated: false,
    ...rest,
    reached: {
      applied: true,
      replied: false,
      conversation: false,
      interview: false,
      offer: false,
      ...reached,
    },
  };
}

describe('rate', () => {
  it('is a whole percentage, and nothing at all under 5 applications', () => {
    expect(rate(3, 19)).toBe(16);
    expect(rate(0, 40)).toBe(0);
    expect(rate(2, 4)).toBeUndefined();
  });
});

describe('factsOf', () => {
  it('counts every stage the application went through, not only the current status', () => {
    const facts = factsOf(
      item(
        'ness:1',
        entry({
          status: 'rejected',
          history: steps(
            ['applied', 20],
            ['recruiter_call', 18],
            ['interview_video', 10],
            ['rejected', 3],
          ),
        }),
      ),
      'NESS',
    );
    expect(facts.reached).toEqual({
      applied: true,
      replied: true,
      conversation: true,
      interview: true,
      offer: false,
    });
    expect(facts).toMatchObject({ rejected: true, inProcess: false, frontal: false, replyDays: 2 });
  });

  it('reads a rejection with nothing before it as an answer, but not as a conversation', () => {
    const facts = factsOf(
      item('a:1', entry({ status: 'rejected', history: steps(['applied', 20], ['rejected', 5]) })),
      'A',
    );
    expect(facts.reached.replied).toBe(true);
    expect(facts.reached.conversation).toBe(false);
    expect(facts.replyDays).toBe(15);
  });

  it('rebuilds entries from before the history from their dates, leaving the guessed date out of the times', () => {
    const facts = factsOf(
      item('a:1', entry({ status: 'recruiter_call', updatedAt: daysAgo(15) })),
      'A',
    );
    expect(facts.reached.conversation).toBe(true);
    expect(facts.inProcess).toBe(true);
    expect(facts.replyDays).toBeUndefined();
    expect(facts.replyDateEstimated).toBe(true);
  });

  it('measures the reply time in Israeli calendar days', () => {
    // Applied 23:30 on one day, called 08:00 the next morning: one day, though only 8.5 hours passed.
    const applied = '2026-11-01T21:30:00Z';
    const called = '2026-11-02T06:00:00Z';
    const facts = factsOf(
      item(
        'a:1',
        entry({
          status: 'recruiter_call',
          appliedAt: applied,
          history: [
            { status: 'applied', at: applied },
            { status: 'recruiter_call', at: called },
          ],
        }),
      ),
      'A',
    );
    expect(facts.replyDays).toBe(1);
  });

  it('has no answer while the application is only "הגשתי"', () => {
    const facts = factsOf(item('a:1', entry()), 'A');
    expect(facts.reached.replied).toBe(false);
    expect(facts.replyDateEstimated).toBe(false);
  });
});

describe('submitterName', () => {
  const job = (extra: Partial<Job>) =>
    ({ id: 'j', title: 'QA', url: 'https://x.test', state: 'active', ...extra }) as Job;

  it("names a radar job by its source when the source is an agency or the company's own site", () => {
    expect(
      submitterName(
        item('ness:1', entry(), job({ agency: 'Ness Technologies', company: 'אקמה' })),
        { name: 'NESS', type: 'agency' },
      ),
    ).toBe('NESS');
    expect(
      submitterName(item('harel:1', entry(), job({ company: 'הראל ביטוח' })), {
        name: 'הראל',
        type: 'direct',
      }),
    ).toBe('הראל');
  });

  it('names a job-board job by the agency or company on it', () => {
    const source = { name: 'לוח משרות', type: 'board' as const };
    expect(
      submitterName(item('b:1', entry(), job({ agency: 'SQLink', company: 'אקמה' })), source),
    ).toBe('SQLink');
    expect(submitterName(item('b:2', entry(), job({ company: 'אקמה' })), source)).toBe('אקמה');
  });

  it('names a hand-added application by the company typed in it', () => {
    const manual = entry({ manual: true, snapshot: { title: 'QA', company: ' Gtech ', url: '' } });
    expect(submitterName(item('manual:1', manual), undefined)).toBe('Gtech');
    expect(submitterName(item('manual:2', entry({ manual: true })), undefined)).toBe('לא ידוע');
  });
});

describe('collectFacts', () => {
  it('keeps only applications, finding each source by the id once the job is gone', () => {
    const items = buildItems(
      {
        'ness:1': entry(),
        'ness:2': entry({ status: 'saved', appliedAt: undefined }),
        'ness:3': entry({ status: 'viewed', appliedAt: undefined }),
      },
      new Map(),
    );
    const facts = collectFacts(items, (id) =>
      id === 'ness' ? { name: 'NESS', type: 'agency' } : undefined,
    );
    expect(facts.map((f) => [f.id, f.submitter])).toEqual([['ness:1', 'NESS']]);
  });
});

describe('bySubmitter', () => {
  it('joins spellings of one agency under the name its source uses, the biggest first', () => {
    const rows = bySubmitter([
      fact({ submitter: 'Comblack' }),
      fact({ submitter: 'Ness', manual: true, reached: { replied: true } }),
      fact({ submitter: 'NESS' }),
      fact({ submitter: 'NESS', reached: { replied: true } }),
      fact({ submitter: 'Moveo Source', manual: true }),
      fact({ submitter: 'Moveo' }),
    ]);
    expect(rows).toEqual([
      { name: 'NESS', applications: 3, replied: 2 },
      { name: 'Moveo', applications: 2, replied: 0 },
      { name: 'Comblack', applications: 1, replied: 0 },
    ]);
  });

  it('folds the small ones into "אחרים", but never a single name', () => {
    const many = ['A', 'B', 'C', 'D'].flatMap((name, i) =>
      Array.from({ length: 4 - i }, () =>
        fact({ submitter: `${name}corp`, reached: { replied: name === 'D' } }),
      ),
    );
    expect(bySubmitter(many, 2)).toEqual([
      { name: 'Acorp', applications: 4, replied: 0 },
      { name: 'Bcorp', applications: 3, replied: 0 },
      { name: 'אחרים', applications: 3, replied: 1, names: 2 },
    ]);
    expect(bySubmitter(many, 3).map((r) => r.name)).toEqual(['Acorp', 'Bcorp', 'Ccorp', 'Dcorp']);
  });
});

describe('weeklyCohorts', () => {
  it('runs from the first application to this week, empty weeks included', () => {
    const weeks = weeklyCohorts(
      [
        fact({ appliedAt: '2026-10-20T09:00:00Z', reached: { replied: true } }),
        fact({ appliedAt: '2026-10-21T09:00:00Z' }),
        fact({ appliedAt: '2026-11-09T09:00:00Z' }),
        fact({ appliedAt: undefined }),
      ],
      now,
    );
    expect(weeks).toEqual([
      { week: '2026-10-18', applications: 2, replied: 1 },
      { week: '2026-10-25', applications: 0, replied: 0 },
      { week: '2026-11-01', applications: 0, replied: 0 },
      { week: '2026-11-08', applications: 1, replied: 0 },
    ]);
  });

  it('shows the latest weeks only', () => {
    const weeks = weeklyCohorts([fact({ appliedAt: '2026-01-05T09:00:00Z' })], now, 12);
    expect(weeks).toHaveLength(12);
    expect(weeks.at(-1)!.week).toBe('2026-11-08');
  });
});

describe('computeStats', () => {
  const facts = [
    fact({
      id: '1',
      appliedAt: daysAgo(40),
      reached: { replied: true, conversation: true, interview: true },
      frontal: true,
      rejected: true,
      replyDays: 3,
    }),
    fact({
      id: '2',
      appliedAt: daysAgo(35),
      reached: { replied: true, conversation: true },
      homeAssignment: true,
      inProcess: true,
      replyDays: 0,
    }),
    fact({
      id: '3',
      appliedAt: daysAgo(20),
      reached: { replied: true },
      rejected: true,
      replyDays: 10,
    }),
    fact({
      id: '4',
      appliedAt: daysAgo(20),
      reached: { replied: true, conversation: true },
      manual: true,
      replyDateEstimated: true,
    }),
    fact({ id: '5', appliedAt: daysAgo(15) }),
    fact({ id: '6', appliedAt: daysAgo(5) }),
    fact({ id: '7', appliedAt: undefined }),
  ];

  it('counts each funnel stage out of the stage before it', () => {
    const s = computeStats(facts, now);
    expect(s.funnel).toEqual([
      { stage: 'applied', count: 7 },
      { stage: 'replied', count: 4, of: 7 },
      { stage: 'conversation', count: 3, of: 4 },
      { stage: 'interview', count: 1, of: 3 },
      { stage: 'offer', count: 0, of: 1 },
    ]);
    expect(s).toMatchObject({
      applications: 7,
      replied: 4,
      undated: 1,
      homeAssignments: 1,
      frontals: 1,
      rejected: 2,
      inProcess: 1,
      radar: { applications: 6, replied: 3 },
      manual: { applications: 1, replied: 1 },
    });
  });

  it('times the answers whose dates are known, and counts the silent applications', () => {
    const s = computeStats(facts, now);
    expect(s.delays).toMatchObject({ known: 3, estimated: 1, medianDays: 3 });
    expect(s.delays.buckets.map((b) => b.count)).toEqual([1, 1, 0, 1, 0]);
    expect(s.silences).toEqual([
      { days: 14, eligible: 5, noReply: 1 },
      { days: 30, eligible: 2, noReply: 0 },
    ]);
  });

  it('limits everything to the applications sent in the period', () => {
    const s = computeStats(facts, now, '30d');
    expect(s.applications).toBe(4);
    expect(s.undated).toBe(0);
    expect(s.firstAppliedAt).toBe(daysAgo(20));
    expect(s.funnel[1]).toEqual({ stage: 'replied', count: 2, of: 4 });
  });

  it('takes the middle of two for an even number of reply times', () => {
    const s = computeStats([fact({ replyDays: 1 }), fact({ replyDays: 2 })], now);
    expect(s.delays.medianDays).toBe(1.5);
  });
});
