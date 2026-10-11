import { describe, expect, it } from 'vitest';
import type { HealthFile, JobsFile } from '@qa-radar/shared';
import { loadConfig, sourceSchema, type SourceConfig } from '../src/config.ts';
import type { PoliteClient } from '../src/http.ts';
import { collect } from '../src/pipeline/run.ts';
import { summarizeWatch } from '../src/pipeline/watch.ts';

describe('summarizeWatch', () => {
  const t0 = '2026-10-10T08:00:00.000Z';
  const t1 = '2026-10-11T08:00:00.000Z';

  it('treats the first check as a silent baseline', () => {
    const first = summarizeWatch(undefined, [{ id: 'ingima:a', score: 80 }], t0);
    expect(first).toEqual([{ key: expect.any(String) as string, firstSeenAt: t0, score: 80, baseline: true }]);
  });

  it('keeps first-seen dates, marks newcomers, drops jobs that left', () => {
    const first = summarizeWatch(undefined, [{ id: 'ingima:a', score: 80 }, { id: 'ingima:b', score: 60 }], t0);
    const next = summarizeWatch(first, [{ id: 'ingima:a', score: 82 }, { id: 'ingima:c', score: 90 }], t1);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ firstSeenAt: t0, score: 82, baseline: true });
    expect(next[1]).toEqual({ key: expect.any(String) as string, firstSeenAt: t1, score: 90 });
  });
});

describe('watch mode in a collector run', () => {
  const watchSource = sourceSchema.parse({
    id: 'agency',
    name: 'סוכנות',
    type: 'agency',
    tier: 'D',
    adapter: 'link-out',
    homepage: 'https://agency.test/jobs',
    watch: {
      adapter: 'embedded-json',
      options: {
        url: 'https://agency.test/api/jobs',
        api: true,
        fields: { id: 'id', title: 'title', description: 'description' },
      },
    },
  });
  const feed = JSON.stringify([
    { id: 'j1', title: 'QA Automation Engineer', description: 'Playwright, API', recruiter_email: 'r@agency.test' },
    { id: 'j2', title: 'Full-Stack Developer', description: 'React', recruiter_email: 'r@agency.test' },
  ]);
  const config = { ...loadConfig(), sources: [watchSource] as SourceConfig[] };
  const empty = (): { jobs: JobsFile; health: HealthFile } => ({
    jobs: { version: 1, generatedAt: '', jobs: [] },
    health: { version: 1, generatedAt: '', sources: [] },
  });
  const http = (body: string | Error) =>
    ({
      text: async () => {
        if (body instanceof Error) throw body;
        return body;
      },
    }) as unknown as PoliteClient;

  it('counts QA jobs but stores no job and no content', async () => {
    const result = await collect({ config, previous: empty(), http: http(feed), now: new Date('2026-10-11T08:00:00Z') });
    expect(result.jobs.jobs).toEqual([]);
    const health = result.health.sources[0]!;
    expect(health).toMatchObject({ status: 'link-out', fetched: 2, kept: 1, consecutiveFailures: 0 });
    expect(health.watch).toHaveLength(1);
    const saved = JSON.stringify(result.health);
    for (const content of ['QA Automation Engineer', 'Playwright', 'r@agency.test', 'j1']) {
      expect(saved).not.toContain(content);
    }
    expect(result.results[0]!.jobs).toEqual([]);
  });

  it('keeps the last count when a check fails', async () => {
    const first = await collect({ config, previous: empty(), http: http(feed), now: new Date('2026-10-11T08:00:00Z') });
    const previous = { jobs: first.jobs, health: first.health };
    const failed = await collect({
      config,
      previous,
      http: http(new Error('HTTP 403')),
      now: new Date('2026-10-11T12:00:00Z'),
    });
    const health = failed.health.sources[0]!;
    expect(health).toMatchObject({ status: 'link-out', error: 'HTTP 403', consecutiveFailures: 1 });
    expect(health.watch).toEqual(first.health.sources[0]!.watch);
  });
});
