import { describe, expect, it } from 'vitest';
import type { HealthFile } from '@qa-radar/shared';
import { healthChanged } from '../src/store.ts';

const file = (generatedAt: string, quickLinks: Array<{ label: string; url: string }>): HealthFile =>
  ({
    version: 1,
    generatedAt,
    sources: [
      {
        id: 'idor',
        name: 'Idor',
        type: 'agency',
        tier: 'D',
        homepage: 'https://idor.test/jobs/',
        quickLinks,
        status: 'link-out',
        consecutiveFailures: 0,
        baselineDone: false,
        recentCounts: [],
      },
    ],
  }) as HealthFile;

describe('healthChanged', () => {
  const links = [{ label: 'jobs', url: 'https://idor.test/jobs/' }];

  it('ignores the timestamp, so a run with nothing due stays a no-op', () => {
    expect(healthChanged(file('2026-10-07T06:00:00Z', links), file('2026-10-07T07:00:00Z', links))).toBe(
      false,
    );
  });

  it('notices registry edits such as a new quick link', () => {
    const more = [...links, { label: 'Jobnet', url: 'https://jobnet.test/Company?companyID=1' }];
    expect(healthChanged(file('a', links), file('a', more))).toBe(true);
  });
});
