import { describe, expect, it } from 'vitest';
import type { HealthFile, SourceHealth } from '@qa-radar/shared';
import { loadConfig, sourceSchema } from '../src/config.ts';
import type { PoliteClient } from '../src/http.ts';
import { collect } from '../src/pipeline/run.ts';

const source = (id: string) =>
  sourceSchema.parse({
    id,
    name: id,
    type: 'direct',
    tier: 'A',
    adapter: 'embedded-json',
    homepage: `https://${id}.test/`,
    options: { url: `https://${id}.test/api`, api: true, fields: { id: 'id', title: 'title' } },
  });

describe('collect — only sources that never ran (a push outside the schedule)', () => {
  it('fetches the new source and leaves the others alone', async () => {
    const requested: string[] = [];
    const http = {
      text: async (url: string) => {
        requested.push(url);
        return JSON.stringify([{ id: '1', title: 'QA Engineer' }]);
      },
    } as unknown as PoliteClient;
    const ran: SourceHealth = {
      id: 'old',
      name: 'old',
      type: 'direct',
      tier: 'A',
      homepage: 'https://old.test/',
      status: 'ok',
      consecutiveFailures: 0,
      baselineDone: true,
      recentCounts: [1],
      lastRunAt: '2026-10-15T09:00:00.000Z',
    };
    const health: HealthFile = { version: 1, generatedAt: '', sources: [ran] };
    const result = await collect({
      config: { ...loadConfig(), sources: [source('old'), source('fresh')] },
      previous: { jobs: { version: 1, generatedAt: '', jobs: [] }, health },
      http,
      now: new Date('2026-10-15T19:11:00Z'),
      onlyNew: true,
    });
    expect(requested).toEqual(['https://fresh.test/api']);
    expect(result.results.map((r) => r.sourceId)).toEqual(['fresh']);
  });
});
