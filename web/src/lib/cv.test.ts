import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Job, ScoringConfig, SourceHealth } from '@qa-radar/shared';
import {
  CvReadError,
  cvProfile,
  findSkills,
  matchSummary,
  mirrorHebrew,
  missingSkills,
  rescoreJobs,
  rescoreWatched,
} from './cv.ts';
import { docxText, wordXmlText } from './docx.ts';

const scoring: ScoringConfig = {
  skills: [
    { label: 'Manual / E2E', terms: ['manual', 'ידני', 'ידניות', 'E2E'] },
    { label: 'SQL', terms: ['SQL'] },
    { label: 'Postman', terms: ['Postman'] },
    { label: 'Mobile (iOS/Android)', terms: ['mobile', 'מובייל', 'iOS', 'Android'] },
    { label: 'רגרסיה / סניטי', terms: ['regression', 'רגרסיה'] },
    { label: 'Python', terms: ['Python', 'pytest'] },
    { label: 'Playwright', terms: ['Playwright'] },
  ],
  have: ['Manual / E2E', 'SQL', 'Postman'],
  yearsExperience: 2,
  bonusTags: { 'פינטק/בנקאות/ביטוח': 10 },
};

describe('finding skills in a CV', () => {
  it('finds Hebrew and English skills (gender forms, prefixes, any case)', () => {
    const text =
      'QA Engineer\nבדיקות ידניות ורגרסיה למערכות בנקאיות\nTools: postman, SQL Server, PYTEST';
    expect(findSkills(text, scoring.skills)).toEqual([
      'Manual / E2E',
      'SQL',
      'Postman',
      'רגרסיה / סניטי',
      'Python',
    ]);
  });

  it('ignores contact lines: "Mobile: 054-…" is a phone number, not mobile testing', () => {
    const text =
      'Noa Levi\nMobile: 054-1234567 | noa@example.com\nlinkedin.com/in/noa — https://github.com/noa\nSQL';
    expect(findSkills(text, scoring.skills)).toEqual(['SQL']);
    expect(findSkills('Mobile testing on iOS and Android', scoring.skills)).toEqual([
      'Mobile (iOS/Android)',
    ]);
  });

  it('reads Hebrew that a PDF stored in visual order ("תוינדי תוקידב" → "בדיקות ידניות")', () => {
    expect(mirrorHebrew('תוינדי תוקידב')).toBe('בדיקות ידניות');
    expect(mirrorHebrew('Postman SQL')).toBe('Postman SQL');
    expect(findSkills('היסרגר תוקידב\nלייבומ תוקידב', scoring.skills)).toEqual([
      'Mobile (iOS/Android)',
      'רגרסיה / סניטי',
    ]);
  });
});

describe('reading Word files', () => {
  const docx = (xml: string) =>
    zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<Types/>') });

  it('takes one line per paragraph, joining runs and decoding entities', () => {
    const xml =
      '<w:document><w:body>' +
      '<w:p><w:r><w:t>QA </w:t></w:r><w:r><w:t xml:space="preserve">Engineer</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>SQL</w:t><w:tab/><w:t>Postman &amp; Jira</w:t></w:r></w:p>' +
      '<w:p></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>בדיקות&#32;ידניות</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '</w:body></w:document>';
    expect(docxText(docx(xml))).toBe('QA Engineer\nSQL Postman & Jira\nבדיקות ידניות');
    expect(wordXmlText('<w:p><w:r><w:t>a&lt;b&#x41;</w:t></w:r></w:p>')).toBe('a<bA');
  });

  it('says so when the file is not a Word document', () => {
    expect(() => docxText(strToU8('not a zip'))).toThrow(CvReadError);
    expect(() => docxText(zipSync({ 'other.xml': strToU8('<x/>') }))).toThrow(/Word/);
  });
});

const job = (id: string, extra: Partial<Job>): Job => ({
  id,
  sourceId: 'x',
  url: '',
  title: id,
  regions: ['center'],
  tags: [],
  seniority: 'unknown',
  score: 50,
  matched: [],
  missing: [],
  firstSeenAt: '2026-11-17T08:00:00.000Z',
  lastSeenAt: '2026-11-17T08:00:00.000Z',
  missingStreak: 0,
  state: 'active',
  baseline: false,
  ...extra,
});

const jobs = [
  job('a', {
    requires: ['Manual / E2E', 'SQL', 'Python'],
    tags: ['פינטק/בנקאות/ביטוח'],
    seniority: 'mid',
    yearsRequired: 2,
  }),
  job('b', { requires: ['Playwright', 'Python'], seniority: 'senior', yearsRequired: 5 }),
  job('c', { requires: ['Postman', 'Playwright'] }),
  job('old', { score: 61, matched: ['SQL'] }), // collected before jobs had `requires`
  job('closed', { requires: ['Python'], state: 'closed' }),
];

describe('scoring against a CV', () => {
  const cv = { skills: ['Manual / E2E', 'SQL', 'Playwright'], yearsExperience: 2 };

  it('re-scores jobs that list their skills; older jobs keep their stored score', () => {
    const [a, b, c, old] = rescoreJobs(jobs, scoring, cv);
    expect(a).toMatchObject({ score: 82, matched: ['Manual / E2E', 'SQL'], missing: ['Python'] }); // 50+12−6+10+10+6
    expect(b).toMatchObject({
      score: 25,
      matched: ['Playwright'],
      missing: ['Python', '5+ שנות ניסיון'],
    }); // 50+6−6−10−15
    expect(c).toMatchObject({ score: 50, matched: ['Playwright'], missing: ['Postman'] });
    expect(old).toBe(jobs[3]);
  });

  it('compares the fixed profile with the CV on the open jobs', () => {
    const fixed = matchSummary(jobs, {
      have: new Set(scoring.have),
      yearsExperience: 2,
      bonusTags: scoring.bonusTags,
    });
    const withCv = matchSummary(jobs, cvProfile(scoring, cv));
    // Fixed profile: a 82, b 13 (50−12−10−15), c 50. CV: a 82, b 25, c 50.
    expect(fixed).toEqual({ jobs: 3, average: 48, strong: 1 });
    expect(withCv).toEqual({ jobs: 3, average: 52, strong: 1 });
  });

  it('lists the skills open jobs ask for most that the CV lacks', () => {
    expect(missingSkills(jobs, new Set(cv.skills))).toEqual([
      { label: 'Python', count: 2, share: 67 },
      { label: 'Postman', count: 1, share: 33 },
    ]);
  });

  it('re-scores watch-mode jobs from the classification the collector kept', () => {
    const source = (watch: SourceHealth['watch']): SourceHealth => ({
      id: 'w',
      name: 'w',
      type: 'agency',
      tier: 'D',
      homepage: '',
      status: 'link-out',
      consecutiveFailures: 0,
      baselineDone: true,
      recentCounts: [],
      watch,
    });
    const at = '2026-11-17T08:00:00.000Z';
    const [watched, plain] = rescoreWatched(
      [
        source([
          // 50 + 12 (Playwright, SQL) + 10 (fintech) + 10 (mid) + 6 (2 years) = 88; was 40 by the profile.
          {
            key: 'a',
            firstSeenAt: at,
            score: 40,
            requires: ['SQL', 'Playwright'],
            tags: ['פינטק/בנקאות/ביטוח'],
            seniority: 'mid',
            yearsRequired: 2,
          },
          { key: 'old', firstSeenAt: at, score: 61 }, // saved before entries kept their skills
        ]),
        source(undefined),
      ],
      scoring,
      cv,
    );
    expect(watched!.watch!.map((w) => w.score)).toEqual([88, 61]);
    expect(plain!.watch).toBeUndefined();
  });
});
