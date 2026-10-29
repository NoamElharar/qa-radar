import { describe, expect, it } from 'vitest';
import {
  ALL_STATUSES,
  HANDLED_STATUSES,
  importPersonal,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_FORMATS,
  interviewFormatOf,
  LEGACY_STATUSES,
  mergePersonalChanges,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  STATUS_ORDER,
  type PersonalData,
  type StatusEntry,
} from './storage.ts';

const empty = (): PersonalData => ({ version: 1, statuses: {}, hiddenCompanies: [], quickChecks: {} });

describe('statuses', () => {
  it('puts the two new steps between "הגשתי" and "ראיון", with Hebrew labels', () => {
    expect(STATUS_ORDER).toEqual([
      'saved',
      'applied',
      'recruiter_call',
      'home_assignment',
      'interview_video',
      'interview_frontal',
      'awaiting_answer',
      'offer',
      'rejected',
      'irrelevant',
      'viewed',
    ]);
    expect(STATUS_LABELS.applied).toBe('הגשתי');
    expect(STATUS_LABELS.recruiter_call).toBe('שיחה ממגייסת');
    expect(STATUS_LABELS.home_assignment).toBe('עבודת בית');
  });

  it('splits "ראיון" into video, frontal and waiting for the answer — in that order', () => {
    expect(STATUS_LABELS.interview_video).toBe('ראיון שיחת וידאו');
    expect(STATUS_LABELS.interview_frontal).toBe('ראיון פרונטלי');
    expect(STATUS_LABELS.awaiting_answer).toBe('ממתין לתשובה');
    for (const s of ['interview_video', 'interview_frontal', 'awaiting_answer'] as const) {
      expect(STATUS_DESCRIPTIONS[s]).toBeTruthy();
      expect(HANDLED_STATUSES.has(s)).toBe(true);
    }
  });

  it('keeps the old "ראיון" readable on existing entries, but no longer offers it', () => {
    expect(STATUS_LABELS.interview).toBe('ראיון');
    expect(LEGACY_STATUSES.has('interview')).toBe(true);
    expect(ALL_STATUSES).toContain('interview');
    expect(STATUS_ORDER).not.toContain('interview');
  });

  it('explains the new steps (tooltips) and treats them as handled', () => {
    expect(STATUS_DESCRIPTIONS.recruiter_call).toContain('מגייסת');
    expect(STATUS_DESCRIPTIONS.home_assignment).toContain('עבודת בית');
    expect(HANDLED_STATUSES.has('recruiter_call')).toBe(true);
    expect(HANDLED_STATUSES.has('home_assignment')).toBe(true);
  });
});

describe('interview format', () => {
  it('has exactly the five values, "לא ידוע" last', () => {
    expect(INTERVIEW_FORMATS).toEqual(['zoom', 'teams', 'meet', 'frontal', 'unknown']);
    expect(INTERVIEW_FORMAT_LABELS).toEqual({
      zoom: 'Zoom',
      teams: 'Teams',
      meet: 'Google Meet',
      frontal: 'פרונטלי',
      unknown: 'לא ידוע',
    });
  });

  it('defaults to "לא ידוע" for entries without it', () => {
    expect(interviewFormatOf({})).toBe('unknown');
    expect(interviewFormatOf({ interviewFormat: 'teams' })).toBe('teams');
  });
});

describe('JSON import', () => {
  // A backup exactly as the previous version exported it: no new statuses, no interviewFormat.
  const oldExport = JSON.stringify({
    version: 1,
    statuses: {
      'sqlink:123': {
        status: 'interview',
        note: 'ראיון ב-15.9',
        appliedAt: '2026-09-01T09:00:00.000Z',
        updatedAt: '2026-09-10T09:00:00.000Z',
        pinned: true,
        pinnedAt: '2026-09-10T09:00:00.000Z',
        snapshot: { title: 'בודק/ת תוכנה', company: 'SQLink', url: 'https://sqlink.test/123' },
      },
      'manual:abc': {
        status: 'applied',
        appliedAt: '2026-09-20T09:00:00.000Z',
        updatedAt: '2026-09-20T09:00:00.000Z',
        manual: true,
        channel: 'LinkedIn',
        snapshot: { title: 'QA Engineer', company: 'אקמה', url: '' },
      },
    },
    hiddenCompanies: ['חברה מוסתרת'],
    quickChecks: { linkedin: '2026-09-30T08:00:00.000Z' },
    lastVisitAt: '2026-09-30T08:00:00.000Z',
    exportedAt: '2026-10-01T08:00:00.000Z',
    app: 'qa-radar',
  });

  it('still imports a backup from the previous version, unchanged', () => {
    const result = importPersonal(empty(), oldExport);
    const parsed = JSON.parse(oldExport) as PersonalData;
    expect(result.statuses).toEqual(parsed.statuses);
    expect(result.hiddenCompanies).toEqual(['חברה מוסתרת']);
    expect(result.quickChecks).toEqual({ linkedin: '2026-09-30T08:00:00.000Z' });
    expect(interviewFormatOf(result.statuses['sqlink:123']!)).toBe('unknown');
  });

  it('accepts the new statuses and the interview format', () => {
    const json = JSON.stringify({
      app: 'qa-radar',
      statuses: {
        a: { status: 'recruiter_call', updatedAt: '2026-10-10T09:00:00.000Z' },
        b: { status: 'home_assignment', updatedAt: '2026-10-10T09:00:00.000Z', interviewFormat: 'zoom' },
      },
    });
    const result = importPersonal(empty(), json);
    expect(result.statuses.a?.status).toBe('recruiter_call');
    expect(result.statuses.b).toMatchObject({ status: 'home_assignment', interviewFormat: 'zoom' });
  });

  it('drops an interview format it does not know instead of storing it', () => {
    const json = JSON.stringify({
      app: 'qa-radar',
      statuses: { a: { status: 'interview', updatedAt: '2026-10-10T09:00:00.000Z', interviewFormat: 'skype' } },
    });
    expect(importPersonal(empty(), json).statuses.a).toEqual({
      status: 'interview',
      updatedAt: '2026-10-10T09:00:00.000Z',
    });
  });

  it('a newer entry in the file replaces the one in the browser (how a corrected backup applies)', () => {
    const current = importPersonal(empty(), oldExport);
    const corrected = JSON.stringify({
      app: 'qa-radar',
      statuses: {
        'sqlink:123': {
          ...current.statuses['sqlink:123'],
          status: 'recruiter_call',
          updatedAt: '2026-10-15T09:00:00.000Z',
        },
      },
    });
    expect(importPersonal(current, corrected).statuses['sqlink:123']).toMatchObject({
      status: 'recruiter_call',
      note: 'ראיון ב-15.9',
      pinned: true,
    });
  });
});

describe('two open tabs', () => {
  const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`;
  const entry = (status: StatusEntry['status'], day: number): StatusEntry => ({ status, updatedAt: at(day) });
  // Tab A opened with `before`; tab B saved `stored` since; tab A now makes its own change.
  const before: PersonalData = {
    ...empty(),
    statuses: { moveo: entry('applied', 1), ness: entry('saved', 1) },
    hiddenCompanies: ['אקמה'],
  };
  const stored: PersonalData = {
    ...before,
    statuses: { moveo: entry('recruiter_call', 2), ness: entry('saved', 1), shva: entry('applied', 2) },
    hiddenCompanies: ['אקמה', 'חברה ב'],
    quickChecks: { dialog: at(2) },
  };

  it('keeps what the other tab saved when this tab changes a different job', () => {
    const after = { ...before, statuses: { ...before.statuses, ness: entry('applied', 3) } };
    expect(mergePersonalChanges(before, after, stored).statuses).toEqual({
      moveo: entry('recruiter_call', 2), // the recruiter call from tab B survives
      ness: entry('applied', 3),
      shva: entry('applied', 2),
    });
  });

  it('this tab’s own change to the same job wins, and a cleared status stays cleared', () => {
    const changed = { ...before, statuses: { ...before.statuses, moveo: entry('interview_video', 3) } };
    expect(mergePersonalChanges(before, changed, stored).statuses.moveo).toEqual(entry('interview_video', 3));

    const { ness: _cleared, ...rest } = before.statuses;
    const cleared = { ...before, statuses: rest };
    expect(mergePersonalChanges(before, cleared, stored).statuses).toEqual({
      moveo: entry('recruiter_call', 2),
      shva: entry('applied', 2),
    });
  });

  it('merges hidden companies and manual checks the same way', () => {
    const after = { ...before, hiddenCompanies: ['חברה ג'], quickChecks: { sqlink: at(3) } };
    const merged = mergePersonalChanges(before, after, stored);
    expect(merged.hiddenCompanies).toEqual(['חברה ב', 'חברה ג']); // "אקמה" unhidden here, "חברה ב" hidden there
    expect(merged.quickChecks).toEqual({ dialog: at(2), sqlink: at(3) });
  });
});
