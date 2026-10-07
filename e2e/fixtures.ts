import type { HealthFile, Job, JobsFile, SourceHealth } from '@qa-radar/shared';

/**
 * Deterministic dashboard data for the end-to-end tests. Timestamps are relative to `now`, so the
 * "חדש היום" view always has the same jobs no matter when the suite runs.
 */
export const TITLES = {
  manualNew: 'בודק/ת תוכנה ידני/ת',
  automationNew: 'QA Automation Engineer',
  longNew:
    'Senior QA Automation Engineer – Playwright/TypeScript לחברת פינטק מובילה במרכז הארץ, משרה היברידית עם אפשרות קידום',
  back: 'בודק/ת QA לצוות דיגיטל',
  baseline: 'מהנדס/ת בדיקות API',
  north: 'בודק/ת תוכנה – חיפה',
  closed: 'QA Engineer – משרה שנסגרה',
} as const;

const HOUR = 3_600_000;

function job(now: number, id: string, title: string, extra: Partial<Job>): Job {
  const firstSeenAt = new Date(now - 2 * HOUR).toISOString();
  return {
    id: `fixture:${id}`,
    sourceId: 'fixture',
    sourceJobId: id,
    url: `https://jobs.example.test/${id}`,
    title,
    company: 'אקמה',
    regions: ['center'],
    tags: ['בדיקות ידניות/E2E'],
    seniority: 'junior',
    yearsRequired: 1,
    score: 70,
    matched: ['Manual / E2E'],
    missing: [],
    snippet: 'בדיקות ידניות ואוטומציה למערכות פיננסיות.',
    firstSeenAt,
    lastSeenAt: new Date(now).toISOString(),
    missingStreak: 0,
    state: 'active',
    baseline: false,
    ...extra,
  };
}

export function buildFixtures(now = Date.now()): { jobs: JobsFile; health: HealthFile } {
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const jobs: Job[] = [
    job(now, 'manual', TITLES.manualNew, { agency: 'NESS', company: undefined, endClient: 'חברה פיננסית', score: 74 }),
    job(now, 'automation', TITLES.automationNew, {
      regions: ['shfela'],
      city: 'רחובות',
      distanceKm: 12,
      tags: ['אוטומציה', 'API/Backend'],
      seniority: 'mid',
      yearsRequired: 2,
      score: 88,
      matched: ['Playwright', 'API'],
      missing: ['Java'],
      firstSeenAt: iso(5 * HOUR),
    }),
    job(now, 'long', TITLES.longNew, { score: 61, firstSeenAt: iso(1 * HOUR), seniority: 'senior', yearsRequired: 5 }),
    job(now, 'back', TITLES.back, { firstSeenAt: iso(20 * 24 * HOUR), reappearedAt: iso(1 * HOUR), score: 55 }),
    job(now, 'baseline', TITLES.baseline, { firstSeenAt: iso(3 * 24 * HOUR), baseline: true, score: 66 }),
    job(now, 'north', TITLES.north, { regions: ['north'], city: 'חיפה', distanceKm: 105, score: 50 }),
    job(now, 'closed', TITLES.closed, { state: 'closed', closedAt: iso(24 * HOUR), score: 40 }),
  ];

  const source = (s: Partial<SourceHealth> & Pick<SourceHealth, 'id' | 'name' | 'status'>): SourceHealth => ({
    type: 'direct',
    tier: 'A',
    homepage: `https://${s.id}.example.test/`,
    consecutiveFailures: 0,
    baselineDone: true,
    recentCounts: [7],
    lastRunAt: iso(30 * 60_000),
    lastSuccessAt: iso(30 * 60_000),
    fetched: 7,
    kept: 7,
    ...s,
  });
  const sources: SourceHealth[] = [
    source({ id: 'fixture', name: 'מקור בדיקה', status: 'ok' }),
    source({
      id: 'broken',
      name: 'מקור תקול',
      status: 'error',
      consecutiveFailures: 3,
      lastSuccessAt: undefined,
      error: 'HTTP 403 for https://broken.example.test/jobs',
    }),
    source({
      id: 'board',
      name: 'לוח משרות',
      type: 'board',
      tier: 'D',
      status: 'link-out',
      note: 'תנאי השימוש אוסרים איסוף אוטומטי',
      quickLinks: [{ label: 'משרות QA', url: 'https://board.example.test/qa' }],
    }),
  ];

  return {
    jobs: { version: 1, generatedAt: iso(30 * 60_000), jobs },
    health: { version: 1, generatedAt: iso(30 * 60_000), sources },
  };
}
