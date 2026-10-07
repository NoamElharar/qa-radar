import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HealthFile, Job, JobsFile } from '@qa-radar/shared';

export interface DataPaths {
  dir: string;
  jobs: string;
  health: string;
  archiveDir: string;
}

export function dataPaths(dir: string): DataPaths {
  return {
    dir,
    jobs: join(dir, 'jobs.json'),
    health: join(dir, 'sources-health.json'),
    archiveDir: join(dir, 'archive'),
  };
}

function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function writeJson(file: string, data: unknown): void {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function readState(paths: DataPaths): { jobs: JobsFile; health: HealthFile } {
  return {
    jobs: readJson<JobsFile>(paths.jobs, { version: 1, generatedAt: '', jobs: [] }),
    health: readJson<HealthFile>(paths.health, { version: 1, generatedAt: '', sources: [] }),
  };
}

export function writeState(paths: DataPaths, jobs: JobsFile, health: HealthFile): void {
  mkdirSync(paths.dir, { recursive: true });
  writeJson(paths.jobs, jobs);
  writeJson(paths.health, health);
}

export function writeHealth(paths: DataPaths, health: HealthFile): void {
  mkdirSync(paths.dir, { recursive: true });
  writeJson(paths.health, health);
}

/**
 * True when the per-source entries differ, ignoring `generatedAt`. A run with no due source still
 * publishes registry edits (a new link-out source, changed quick links) instead of waiting hours.
 */
export function healthChanged(previous: HealthFile, next: HealthFile): boolean {
  return JSON.stringify(previous.sources) !== JSON.stringify(next.sources);
}

/** Append archived jobs to data/archive/YYYY-MM.json (by month of closing). */
export function appendArchive(paths: DataPaths, archived: Job[]): void {
  if (!archived.length) return;
  mkdirSync(paths.archiveDir, { recursive: true });
  const byMonth = new Map<string, Job[]>();
  for (const job of archived) {
    const month = (job.closedAt ?? job.lastSeenAt).slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), job]);
  }
  for (const [month, jobs] of byMonth) {
    const file = join(paths.archiveDir, `${month}.json`);
    const existing = readJson<Job[]>(file, []);
    const merged = new Map(existing.map((j) => [j.id, j]));
    for (const j of jobs) merged.set(j.id, j);
    writeJson(file, [...merged.values()]);
  }
}
