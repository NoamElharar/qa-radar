import { mkdirSync, writeFileSync } from 'node:fs';
import { buildFixtures } from './fixtures.ts';
import { DATA_DIR } from './paths.ts';

/** Write fresh fixture data before the run; `vite preview` serves it at /data/ (see web/vite.config.ts). */
export default function globalSetup(): void {
  const { jobs, health } = buildFixtures();
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(`${DATA_DIR}/jobs.json`, JSON.stringify(jobs));
  writeFileSync(`${DATA_DIR}/sources-health.json`, JSON.stringify(health));
}
