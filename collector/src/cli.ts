import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, REPO_ROOT } from './config.ts';
import { collect } from './pipeline/run.ts';
import { shouldRunAt } from './schedule.ts';
import { appendArchive, dataPaths, readState, writeState } from './store.ts';

/**
 * Collector entry point.
 *   npm run collect                 respect the Israel-time schedule and per-source `everyHours`
 *   npm run collect -- --force      run every enabled source now
 *   npm run collect -- --only sqlink,ness
 *   npm run collect -- --dry-run    run but don't write data files
 *   npm run collect -- --data-dir ../data
 */
const { values } = parseArgs({
  options: {
    force: { type: 'boolean', default: false },
    only: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'data-dir': { type: 'string' },
  },
});

const log = (message: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${message}`);

async function main(): Promise<void> {
  const now = new Date();
  const only = values.only?.split(',').map((s) => s.trim()).filter(Boolean);
  if (!values.force && !only) {
    const gate = shouldRunAt(now);
    if (!gate.run) {
      log(`skipping run: ${gate.reason}`);
      return;
    }
    log(`schedule: ${gate.reason}`);
  }

  const config = loadConfig();
  const paths = dataPaths(values['data-dir'] ?? join(REPO_ROOT, 'data'));
  const previous = readState(paths);
  const result = await collect({ config, previous, now, force: values.force, only, log });

  const ok = result.results.filter((r) => r.ok).length;
  const active = result.jobs.jobs.filter((j) => j.state === 'active');
  const fresh = active.filter((j) => !j.baseline && Date.parse(j.firstSeenAt) === now.getTime());
  log(
    `done: ${ok}/${result.results.length} sources ok · ${active.length} active QA jobs · ${fresh.length} new this run · ${result.archived.length} archived`,
  );
  for (const r of result.results.filter((r) => !r.ok)) log(`  ✗ ${r.sourceId}: ${r.error}`);

  if (values['dry-run']) {
    log('dry run — data files not written');
    return;
  }
  writeState(paths, result.jobs, result.health);
  appendArchive(paths, result.archived);
  log(`wrote ${paths.jobs} and ${paths.health}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
