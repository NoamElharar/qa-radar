import { describe, expect, it } from 'vitest';
import type { Job } from '@qa-radar/shared';
import { applyFilters, defaultFilters, filtersFromParams, filtersToParams, isHiddenCompany, type Filters } from './filters.ts';

const now = new Date('2026-10-04T08:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    sourceId: 'sqlink',
    url: `https://example.test/${id}`,
    title: 'בודק/ת תוכנה',
    regions: ['center'],
    tags: [],
    seniority: 'mid',
    score: 60,
    matched: [],
    missing: [],
    firstSeenAt: hoursAgo(2),
    lastSeenAt: hoursAgo(1),
    missingStreak: 0,
    state: 'active',
    baseline: false,
    ...overrides,
  };
}

const ctx = { now, statuses: {}, hiddenCompanies: [] };
const ids = (jobs: Job[]) => jobs.map((j) => j.id);
const filters = (overrides: Partial<Filters> = {}, view: Filters['view'] = 'new') => ({ ...defaultFilters(view), ...overrides });

describe('URL state', () => {
  it('round-trips through the query string, writing only non-defaults', () => {
    const f = filters({ q: 'API', tags: ['מובייל'], minScore: 60, sort: 'score' }, 'all');
    const params = filtersToParams(f);
    expect(params.toString()).toBe('view=all&q=API&tags=%D7%9E%D7%95%D7%91%D7%99%D7%99%D7%9C&min=60&sort=score');
    expect(filtersFromParams(params)).toEqual(f);
  });

  it('default view has an empty query string (clean bookmark)', () => {
    expect(filtersToParams(defaultFilters()).toString()).toBe('');
  });

  it('ignores junk values', () => {
    const f = filtersFromParams(new URLSearchParams('view=zzz&r=center,mars&t=1y&km=-3'));
    expect(f).toMatchObject({ view: 'new', regions: ['center'], time: '24h', maxKm: undefined });
  });
});

describe('"חדש היום" view', () => {
  it('shows new and returning jobs, never baseline or old ones', () => {
    const jobs = [
      job('new', { firstSeenAt: hoursAgo(3) }),
      job('baseline', { firstSeenAt: hoursAgo(3), baseline: true }),
      job('old', { firstSeenAt: hoursAgo(50) }),
      job('back', { firstSeenAt: hoursAgo(500), reappearedAt: hoursAgo(4), baseline: true }),
    ];
    expect(ids(applyFilters(jobs, filters(), ctx))).toEqual(['new', 'back']);
  });

  it('defaults to מרכז + שפלה but keeps jobs with unknown location', () => {
    const jobs = [job('ta'), job('haifa', { regions: ['north'] }), job('unknown', { regions: [] }), job('remote-only', { regions: ['remote'] })];
    expect(ids(applyFilters(jobs, filters(), ctx)).sort()).toEqual(['remote-only', 'ta', 'unknown']);
    expect(ids(applyFilters(jobs, filters({ includeUnknown: false }), ctx))).toEqual(['ta']);
  });
});

describe('filters', () => {
  const all = (o: Partial<Filters> = {}) => filters(o, 'all');

  it('hides handled jobs and hidden companies', () => {
    const jobs = [job('a'), job('b', { company: 'אקמה בע"מ' }), job('c', { title: 'QA לחברת אקמה' })];
    const statuses = { a: { status: 'applied' as const, updatedAt: hoursAgo(1) } };
    expect(ids(applyFilters(jobs, all(), { ...ctx, statuses, hiddenCompanies: ['אקמה'] }))).toEqual([]);
    expect(ids(applyFilters(jobs, all({ hideHandled: false }), { ...ctx, statuses }))).toEqual(['a', 'b', 'c']);
  });

  it('filters by time window on first-seen time', () => {
    const jobs = [job('today', { firstSeenAt: hoursAgo(5) }), job('lastweek', { firstSeenAt: hoursAgo(24 * 6) })];
    expect(ids(applyFilters(jobs, all({ time: '3d' }), ctx))).toEqual(['today']);
    expect(ids(applyFilters(jobs, all({ time: '7d' }), ctx))).toEqual(['today', 'lastweek']);
  });

  it('filters by distance, tags, seniority, score and search', () => {
    const jobs = [
      job('near', { distanceKm: 8, tags: ['API/Backend'], seniority: 'junior', score: 80, title: 'QA Engineer' }),
      job('far', { distanceKm: 60, tags: ['מובייל'], seniority: 'senior', score: 40 }),
    ];
    expect(ids(applyFilters(jobs, all({ maxKm: 20, includeUnknown: false }), ctx))).toEqual(['near']);
    expect(ids(applyFilters(jobs, all({ tags: ['מובייל'] }), ctx))).toEqual(['far']);
    expect(ids(applyFilters(jobs, all({ seniority: ['junior', 'mid'] }), ctx))).toEqual(['near']);
    expect(ids(applyFilters(jobs, all({ minScore: 50 }), ctx))).toEqual(['near']);
    expect(ids(applyFilters(jobs, all({ q: 'בודקת' }), ctx))).toEqual(['far']);
  });

  it('hides closed jobs unless asked', () => {
    const jobs = [job('open'), job('closed', { state: 'closed', closedAt: hoursAgo(1) })];
    expect(ids(applyFilters(jobs, all(), ctx))).toEqual(['open']);
    expect(ids(applyFilters(jobs, all({ showClosed: true }), ctx)).sort()).toEqual(['closed', 'open']);
  });

  it('sorts by newest or by best match', () => {
    const jobs = [job('older-better', { firstSeenAt: hoursAgo(10), score: 90 }), job('newer', { firstSeenAt: hoursAgo(1), score: 50 })];
    expect(ids(applyFilters(jobs, all(), ctx))).toEqual(['newer', 'older-better']);
    expect(ids(applyFilters(jobs, all({ sort: 'score' }), ctx))).toEqual(['older-better', 'newer']);
  });
});

describe('isHiddenCompany', () => {
  it('matches company, agency, end client or title, ignoring gender slashes', () => {
    expect(isHiddenCompany(job('x', { agency: 'SQLink' }), ['sqlink'])).toBe(true);
    expect(isHiddenCompany(job('x', { endClient: 'בנק לאומי' }), ['לאומי'])).toBe(true);
    expect(isHiddenCompany(job('x'), ['א'])).toBe(false); // one-letter names are ignored
  });
});
