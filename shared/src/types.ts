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
}

export interface HealthFile {
  version: 1;
  generatedAt: string;
  sources: SourceHealth[];
}
