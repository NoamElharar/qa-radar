/**
 * The match score (0–100), shared by the collector (scored against config/profile.yaml) and the
 * dashboard (re-scored against the skills found in the user's CV). Every point is traceable to a ✓/✗
 * item or a stated rule.
 */
import type { Seniority } from './types.ts';

/** A skill the radar looks for in job texts and in a CV: a display label and its dictionary terms. */
export interface SkillDef {
  label: string;
  terms: string[];
}

/**
 * What the dashboard needs to score jobs against another set of skills. The collector writes it into
 * jobs.json from config/profile.yaml, so the browser and the collector always use the same rules.
 */
export interface ScoringConfig {
  /** Every skill the radar recognises, in display order. A job's `requires` lists these labels. */
  skills: SkillDef[];
  /** The labels the fixed profile says I have (the rest of `skills` count as missing). */
  have: string[];
  yearsExperience: number;
  /** Domains I like (job tags) → bonus points. */
  bonusTags: Record<string, number>;
}

/** The facts about a job the score depends on (all stored in jobs.json). */
export interface ScoreFacts {
  /** Skill labels the job's text mentions, in `ScoringConfig.skills` order. */
  requires: readonly string[];
  tags: readonly string[];
  seniority: Seniority;
  yearsRequired?: number;
}

/** Whose skills to score against: the fixed profile or a CV. */
export interface ScoreProfile {
  have: ReadonlySet<string>;
  yearsExperience: number;
  bonusTags: Readonly<Record<string, number>>;
}

export interface ScoreResult {
  score: number;
  /** ✓ skills the job asks for that I have. */
  matched: string[];
  /** ✗ skills the job asks for that I don't have, plus a "N+ שנות ניסיון" item when far above mine. */
  missing: string[];
}

export const SKILL_POINTS = 6;
const MAX_MATCHED_POINTS = 30;
const MAX_MISSING_POINTS = 24;
const MAX_BONUS_POINTS = 15;
const LEVEL_POINTS: Record<Seniority, number> = {
  junior: 8,
  mid: 10,
  senior: -10,
  management: -15,
  unknown: 0,
};

export function scoreJob(facts: ScoreFacts, profile: ScoreProfile): ScoreResult {
  const matched = facts.requires.filter((s) => profile.have.has(s));
  const missing = facts.requires.filter((s) => !profile.have.has(s));
  let score = 50;
  score += Math.min(matched.length * SKILL_POINTS, MAX_MATCHED_POINTS);
  score -= Math.min(missing.length * SKILL_POINTS, MAX_MISSING_POINTS);
  score += Math.min(
    facts.tags.reduce((sum, tag) => sum + (profile.bonusTags[tag] ?? 0), 0),
    MAX_BONUS_POINTS,
  );
  score += LEVEL_POINTS[facts.seniority];
  if (facts.yearsRequired !== undefined) {
    const gap = facts.yearsRequired - profile.yearsExperience;
    if (gap <= 1) score += 6;
    else if (facts.yearsRequired >= 5) {
      score -= 15;
      missing.push(`${facts.yearsRequired}+ שנות ניסיון`);
    } else score -= 3 * gap;
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), matched, missing };
}

/** The fixed profile from a scoring config (what the collector scored with). */
export function profileOf(config: ScoringConfig): ScoreProfile {
  return {
    have: new Set(config.have),
    yearsExperience: config.yearsExperience,
    bonusTags: config.bonusTags,
  };
}
