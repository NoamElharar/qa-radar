import type { SourceConfig } from '../config.ts';
import type { PoliteClient } from '../http.ts';

/** A job exactly as a source exposes it, before normalization and classification. */
export interface RawJob {
  /** The source's own id when it has one (job number, ATS uid…). */
  sourceJobId?: string;
  /** Absolute link to the posting. Falls back to the source homepage when the site has no per-job page. */
  url?: string;
  title: string;
  /** Hiring company, when the source names it. */
  company?: string;
  /** End client as described by an agency ("חברה פיננסית"). */
  endClient?: string;
  location?: string;
  /** Plain text or HTML — normalized later. */
  description?: string;
  /** Raw date string or ISO; parsed with Hebrew-aware rules later. */
  postedAt?: string;
  /** ISO-3166 alpha-2 when the source reports it. Jobs outside Israel are dropped. */
  country?: string;
}

export interface AdapterContext {
  source: SourceConfig;
  http: PoliteClient;
  log: (message: string) => void;
  /** Title-only QA pre-check — lets adapters skip detail requests for irrelevant jobs. */
  isQaCandidate: (title: string) => boolean;
}

export type Adapter = (ctx: AdapterContext) => Promise<RawJob[]>;
