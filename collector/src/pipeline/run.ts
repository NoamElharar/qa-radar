import type { HealthFile, JobsFile, SourceHealth } from '@qa-radar/shared';
import { ADAPTERS } from '../adapters/index.ts';
import type { AppConfig, SourceConfig } from '../config.ts';
import { PoliteClient } from '../http.ts';
import { isSourceDue } from '../schedule.ts';
import { createClassifier, type Classifier } from './classify.ts';
import { normalizeJobs } from './normalize.ts';
import { mergeRun, type SourceRunResult } from './state.ts';

const SOURCE_TIMEOUT_MS = 5 * 60 * 1000;

export interface CollectOptions {
  config: AppConfig;
  previous: { jobs: JobsFile; health: HealthFile };
  now?: Date;
  /** Ignore `everyHours` and run every enabled source. */
  force?: boolean;
  /** Restrict the run to these source ids. */
  only?: string[];
  http?: PoliteClient;
  log?: (message: string) => void;
}

export interface CollectResult {
  jobs: JobsFile;
  health: HealthFile;
  archived: JobsFile['jobs'];
  results: SourceRunResult[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function runSource(
  source: SourceConfig,
  http: PoliteClient,
  classifier: Classifier,
  now: Date,
  log: (message: string) => void,
): Promise<SourceRunResult & { decisions: ReturnType<typeof normalizeJobs>['decisions'] }> {
  const adapter = ADAPTERS[source.adapter];
  const started = Date.now();
  if (!adapter) {
    return { sourceId: source.id, ok: false, error: `unknown adapter "${source.adapter}"`, fetched: 0, jobs: [], decisions: [] };
  }
  try {
    const raw = await withTimeout(
      adapter({ source, http, log: (m) => log(`[${source.id}] ${m}`), isQaCandidate: classifier.isQaCandidate }),
      SOURCE_TIMEOUT_MS,
      source.id,
    );
    const { kept, decisions } = normalizeJobs(raw, source, classifier, now);
    return { sourceId: source.id, ok: true, fetched: raw.length, jobs: kept, decisions, durationMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { sourceId: source.id, ok: false, error: message, fetched: 0, jobs: [], decisions: [], durationMs: Date.now() - started };
  }
}

/** Run all due sources concurrently (politeness is enforced per host by PoliteClient) and merge state. */
export async function collect(options: CollectOptions): Promise<CollectResult> {
  const { config, previous } = options;
  const now = options.now ?? new Date();
  const log = options.log ?? (() => {});
  const http = options.http ?? new PoliteClient({ log });
  const classifier = createClassifier(config);
  const previousHealth = new Map(previous.health.sources.map((h) => [h.id, h]));

  const runnable = config.sources.filter(
    (s) =>
      s.enabled &&
      s.adapter !== 'link-out' &&
      (!options.only || options.only.includes(s.id)) &&
      (options.force || options.only || isSourceDue(s, previousHealth.get(s.id), now)),
  );
  log(`running ${runnable.length} source(s): ${runnable.map((s) => s.id).join(', ') || '—'}`);

  const results = await Promise.all(
    runnable.map(async (source) => {
      const result = await runSource(source, http, classifier, now, log);
      log(
        result.ok
          ? `[${source.id}] ok — ${result.fetched} fetched, ${result.jobs.length} QA (${result.durationMs}ms)`
          : `[${source.id}] FAILED — ${result.error}`,
      );
      return result;
    }),
  );

  const merged = mergeRun({ previousJobs: previous.jobs.jobs, previousHealth, results, now });
  const nowIso = now.toISOString();

  const sources: SourceHealth[] = config.sources.map((s) => {
    const prev = previousHealth.get(s.id);
    const update = merged.health.get(s.id);
    const base: SourceHealth = {
      id: s.id,
      name: s.name,
      type: s.type,
      tier: s.tier,
      homepage: s.homepage,
      quickLinks: s.quickLinks,
      note: s.note,
      status: prev?.status ?? 'ok',
      consecutiveFailures: prev?.consecutiveFailures ?? 0,
      baselineDone: prev?.baselineDone ?? false,
      recentCounts: prev?.recentCounts ?? [],
      lastRunAt: prev?.lastRunAt,
      lastSuccessAt: prev?.lastSuccessAt,
      fetched: prev?.fetched,
      kept: prev?.kept,
      error: prev?.error,
      durationMs: prev?.durationMs,
    };
    if (!s.enabled) return { ...base, status: 'disabled' };
    if (s.adapter === 'link-out') return { ...base, status: 'link-out' };
    return update ? { ...base, ...update } : base;
  });

  return {
    jobs: { version: 1, generatedAt: nowIso, jobs: merged.jobs },
    health: { version: 1, generatedAt: nowIso, sources },
    archived: merged.archived,
    results,
  };
}
