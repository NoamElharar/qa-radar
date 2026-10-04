import { parseArgs } from 'node:util';
import { loadConfig } from './config.ts';
import { PoliteClient } from './http.ts';
import { createClassifier } from './pipeline/classify.ts';
import { runSource } from './pipeline/run.ts';

/**
 * Developer tool: run ONE source live and print what the pipeline would keep. Writes nothing.
 *   npm run try-source -- sqlink
 *   npm run try-source -- sqlink --all      also list rejected titles with the reason
 */
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { all: { type: 'boolean', default: false } },
});

async function main(): Promise<void> {
  const id = positionals[0];
  const config = loadConfig();
  const source = config.sources.find((s) => s.id === id);
  if (!source) {
    console.log(`Unknown source "${id ?? ''}". Known: ${config.sources.map((s) => s.id).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (source.adapter === 'link-out') {
    console.log(`${source.id} is link-out only — nothing to collect.`);
    return;
  }
  const log = (m: string) => console.log(`  · ${m}`);
  const http = new PoliteClient({ log });
  const result = await runSource(source, http, createClassifier(config), new Date(), log);
  if (!result.ok) {
    console.log(`✗ ${source.id} failed: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${source.name}: ${result.fetched} fetched → ${result.jobs.length} QA (${result.durationMs}ms, ${http.requestCount} requests)\n`);
  for (const j of result.jobs) {
    const where = [j.city, j.regions.join('/'), j.distanceKm !== undefined ? `${j.distanceKm}km` : ''].filter(Boolean).join(' · ');
    console.log(`  [${String(j.score).padStart(3)}] ${j.title}`);
    console.log(`        ${where || 'מיקום לא ידוע'} | ${j.seniority}${j.yearsRequired ? ` (${j.yearsRequired}y)` : ''} | ${j.tags.join(', ')}`);
    if (j.endClient || j.company) console.log(`        ${j.endClient ? `לקוח: ${j.endClient}` : j.company}`);
    console.log(`        ✓ ${j.matched.join(', ') || '—'}   ✗ ${j.missing.join(', ') || '—'}`);
    console.log(`        ${j.url}${j.postedAt ? `  (posted ${j.postedAt.slice(0, 10)})` : ''}`);
  }
  if (values.all) {
    console.log('\nRejected:');
    for (const d of result.decisions.filter((x) => !x.decision.qa)) console.log(`  - ${d.title}   ← ${d.decision.reason}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
