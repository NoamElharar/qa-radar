import { describe, expect, it } from 'vitest';
import { profileOf, scoreJob, type ScoreProfile, type ScoringConfig } from './score.ts';

const profile: ScoreProfile = {
  have: new Set(['Manual / E2E', 'SQL', 'Postman', 'Jira / Xray']),
  yearsExperience: 2,
  bonusTags: { 'פינטק/בנקאות/ביטוח': 10, 'גיימינג/אודיו/מדיה': 8 },
};

describe('scoreJob', () => {
  it('a manual QA job at a bank asking for 2 years: 50 +24 −6 +10 +10 +6 = 94', () => {
    const result = scoreJob(
      {
        requires: ['Manual / E2E', 'SQL', 'Postman', 'Jira / Xray', 'Python'],
        tags: ['פינטק/בנקאות/ביטוח'],
        seniority: 'mid',
        yearsRequired: 2,
      },
      profile,
    );
    expect(result).toEqual({
      score: 94,
      matched: ['Manual / E2E', 'SQL', 'Postman', 'Jira / Xray'],
      missing: ['Python'],
    });
  });

  it('a senior automation job asking for 5+ years: 50 −18 −10 −15 = 7, with the years as a ✗ item', () => {
    const result = scoreJob(
      {
        requires: ['Python', 'Playwright', 'CI/CD'],
        tags: [],
        seniority: 'senior',
        yearsRequired: 5,
      },
      profile,
    );
    expect(result).toEqual({
      score: 7,
      matched: [],
      missing: ['Python', 'Playwright', 'CI/CD', '5+ שנות ניסיון'],
    });
  });

  it('caps skills (+30 / −24) and domain bonuses (+15), and keeps the score within 0–100', () => {
    const many = Array.from({ length: 10 }, (_, i) => `skill ${i}`);
    const rich = scoreJob(
      {
        requires: many,
        tags: ['פינטק/בנקאות/ביטוח', 'גיימינג/אודיו/מדיה'],
        seniority: 'mid',
        yearsRequired: 1,
      },
      { ...profile, have: new Set(many) },
    );
    expect(rich.score).toBe(100); // 50 + 30 + 15 + 10 + 6 = 111 → 100
    const poor = scoreJob(
      { requires: many, tags: [], seniority: 'management', yearsRequired: 9 },
      profile,
    );
    expect(poor.score).toBe(0); // 50 − 24 − 15 − 15 = −4 → 0
  });

  it('scores the same job differently for a different set of skills (a CV)', () => {
    const facts = {
      requires: ['Playwright', 'Python', 'SQL'],
      tags: [],
      seniority: 'unknown' as const,
    };
    expect(scoreJob(facts, profile).score).toBe(44); // ✓ SQL, ✗ Playwright + Python
    expect(
      scoreJob(facts, { ...profile, have: new Set(['Playwright', 'Python', 'SQL']) }).score,
    ).toBe(68);
  });

  it('a 3–4 year requirement costs 3 points per year above mine; within a year of mine earns 6', () => {
    const facts = { requires: [], tags: [], seniority: 'unknown' as const };
    expect(scoreJob({ ...facts, yearsRequired: 3 }, profile).score).toBe(56);
    expect(scoreJob({ ...facts, yearsRequired: 4 }, profile).score).toBe(44);
  });
});

describe('profileOf', () => {
  it('reads the fixed profile out of a scoring config', () => {
    const config: ScoringConfig = {
      skills: [
        { label: 'SQL', terms: ['SQL'] },
        { label: 'Python', terms: ['Python'] },
      ],
      have: ['SQL'],
      yearsExperience: 2,
      bonusTags: {},
    };
    expect([...profileOf(config).have]).toEqual(['SQL']);
    expect(profileOf(config).yearsExperience).toBe(2);
  });
});
