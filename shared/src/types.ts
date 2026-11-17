import type { ScoringConfig } from './score.ts';

/** How a job reached us: straight from the hiring company, via an agency/outsourcer, or via a job board. */
export type SourceType = 'direct' | 'agency' | 'board';

/** A–B are collected automatically; D sources are link-out only (see docs/PHASE-0-SOURCE-AUDIT.md). */
export type SourceTier = 'A' | 'B' | 'D';

export type RegionId = 'center' | 'shfela' | 'sharon' | 'jerusalem' | 'north' | 'south' | 'remote';

export type Seniority = 'junior' | 'mid' | 'senior' | 'management' | 'unknown';

export type JobState = 'active' | 'closed';

/** One QA-relevant job as stored in data/jobs.json. */
export interface Job {
  /** Stable id: `${sourceId}:${sourceJobId}` or `${sourceId}:url-<hash>`. */
  id: string;
  sourceId: string;
  sourceJobId?: string;
  url: string;
  title: string;
  /** Hiring company when known (direct sources, or end client named by an agency). */
  company?: string;
  /** Agency / outsourcer name when the job was posted by one ("דרך X"). */
  agency?: string;
  /** End client as described by the agency, e.g. "ארגון פיננסי". */
  endClient?: string;
  locationText?: string;
  city?: string;
  regions: RegionId[];
  distanceKm?: number;
  tags: string[];
  seniority: Seniority;
  yearsRequired?: number;
  /** Rule-based match score 0–100 against the profile in config/profile.yaml. */
  score: number;
  matched: string[];
  missing: string[];
  /**
   * Skills the job's full text mentions (labels from `JobsFile.scoring.skills`), so the dashboard can
   * re-score the job against the user's CV. Missing on jobs collected before this field existed.
   */
  requires?: string[];
  /** Short plain-text excerpt of the description (search + context). */
  snippet?: string;
  /** Publication date reported by the source (ISO). Informational only — never drives badges. */
  postedAt?: string;
  /** When our collector first saw this job (ISO). Drives the "חדש"/"טרי" badges. */
  firstSeenAt: string;
  lastSeenAt: string;
  /** Consecutive successful runs of its source in which the job was absent. */
  missingStreak: number;
  state: JobState;
  closedAt?: string;
  /** Set when a closed job shows up again ("חזרה"). */
  reappearedAt?: string;
  /** True when the job was collected during its source's first successful run (silent baseline). */
  baseline: boolean;
}

export interface JobsFile {
  version: 1;
  generatedAt: string;
  jobs: Job[];
  /**
   * Old job id → the id the job has now, for sources whose job identity changed (see `idFromUrl`).
   * Personal statuses saved under an old id follow the job.
   */
  aliases?: Record<string, string>;
  /** The skills and rules the scores were computed with — lets the dashboard re-score against a CV. */
  scoring?: ScoringConfig;
}

export type SourceStatus = 'ok' | 'error' | 'suspect' | 'disabled' | 'link-out';

export interface QuickLink {
  label: string;
  url: string;
}

/** Per-source health, written to data/sources-health.json on every run. */
export interface SourceHealth {
  id: string;
  name: string;
  type: SourceType;
  tier: SourceTier;
  homepage: string;
  quickLinks?: QuickLink[];
  note?: string;
  status: SourceStatus;
  lastRunAt?: string;
  lastSuccessAt?: string;
  /** Jobs returned by the source in the last run (all professions). */
  fetched?: number;
  /** QA-relevant jobs kept from the last run. */
  kept?: number;
  error?: string;
  consecutiveFailures: number;
  /** False until the source's first successful run (which is a silent baseline). */
  baselineDone: boolean;
  /** `fetched` counts of recent successful runs — used to detect suspicious drops. */
  recentCounts: number[];
  durationMs?: number;
  /** Link-out sources in watch mode: the QA-relevant jobs seen on the last successful check. */
  watch?: WatchedJob[];
}

/**
 * One QA-relevant job at a watch-mode source. Deliberately content-free: a hash of the job's id,
 * when we first saw it and our own classification of it — never its title or text, which the
 * source's terms don't let us republish.
 */
export interface WatchedJob {
  key: string;
  firstSeenAt: string;
  /** Our own match score for it (derived, not source content). */
  score?: number;
  /** Seen on the source's first check (silent baseline, never counted as new). */
  baseline?: boolean;
  /**
   * What the score was computed from, so the dashboard can re-score the job against a CV: the skill
   * labels we detected (from `JobsFile.scoring.skills`), the level, the years asked for, and only the
   * domain tags that earn a bonus. Missing on entries saved before CV matching.
   */
  requires?: string[];
  tags?: string[];
  seniority?: Seniority;
  yearsRequired?: number;
}

export interface HealthFile {
  version: 1;
  generatedAt: string;
  sources: SourceHealth[];
}
