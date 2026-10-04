import type { HealthFile, JobsFile } from '@qa-radar/shared';

export interface RadarData {
  jobs: JobsFile;
  health: HealthFile;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadData(): Promise<RadarData> {
  const [jobs, health] = await Promise.all([
    fetchJson<JobsFile>('data/jobs.json'),
    fetchJson<HealthFile>('data/sources-health.json'),
  ]);
  return { jobs, health };
}
