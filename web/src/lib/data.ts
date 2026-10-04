import type { HealthFile, JobsFile } from '@qa-radar/shared';

/** Where the collector runs — used for the "collect now" link (GitHub's "Run workflow" page). */
export const REPO_URL = 'https://github.com/NoamElharar/qa-radar';
export const COLLECT_WORKFLOW_URL = `${REPO_URL}/actions/workflows/collect.yml`;

export interface RadarData {
  jobs: JobsFile;
  health: HealthFile;
}

async function fetchJson<T>(path: string, bustCache: boolean): Promise<T> {
  // GitHub Pages' CDN caches files for ~10 minutes; a unique query string asks for the current copy.
  const url = `${import.meta.env.BASE_URL}${path}${bustCache ? `?v=${Date.now()}` : ''}`;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadData(bustCache = false): Promise<RadarData> {
  const [jobs, health] = await Promise.all([
    fetchJson<JobsFile>('data/jobs.json', bustCache),
    fetchJson<HealthFile>('data/sources-health.json', bustCache),
  ]);
  return { jobs, health };
}
