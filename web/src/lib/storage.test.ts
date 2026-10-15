import { describe, expect, it } from 'vitest';
import {
  HANDLED_STATUSES,
  importPersonal,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_FORMATS,
  interviewFormatOf,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  STATUS_ORDER,
  type PersonalData,
} from './storage.ts';

const empty = (): PersonalData => ({ version: 1, statuses: {}, hiddenCompanies: [], quickChecks: {} });

describe('statuses', () => {
  it('puts the two new steps between "הגשתי" and "ראיון", with Hebrew labels', () => {
    expect(STATUS_ORDER).toEqual([
      'saved',
      'applied',
      'recruiter_call',
      'home_assignment',
      'interview',
      'offer',
      'rejected',
      'irrelevant',
      'viewed',
    ]);
    expect(STATUS_LABELS.applied).toBe('הגשתי');
    expect(STATUS_LABELS.recruiter_call).toBe('שיחה ממגייסת');
    expect(STATUS_LABELS.home_assignment).toBe('עבודת בית');
    expect(STATUS_LABELS.interview).toBe('ראיון');
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
