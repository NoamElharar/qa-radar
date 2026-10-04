import { z } from 'zod';
import { HttpError } from '../http.ts';
import type { Adapter, AdapterContext, RawJob } from './types.ts';

/**
 * Comeet careers API (public, token-based — the same call the company's career widget makes).
 * Docs: https://developers.comeet.com/reference/careers-api-overview
 */
export const comeetOptionsSchema = z.object({
  uid: z.string(),
  token: z.string().optional(),
  /** Slug of the Comeet-hosted page (comeet.com/jobs/<slug>/<uid>) — used to rediscover a rotated token. */
  hostedSlug: z.string().optional(),
});

interface ComeetPosition {
  uid: string;
  name: string;
  department?: string | null;
  company_name?: string | null;
  location?: { name?: string; city?: string; country?: string; is_remote?: boolean } | null;
  workplace_type?: string | null;
  url_comeet_hosted_page?: string | null;
  url_active_page?: string | null;
  details?: Array<{ name: string; value: string }> | null;
}

async function discoverToken(ctx: AdapterContext, uid: string, slug: string): Promise<string | undefined> {
  const html = await ctx.http.text(`https://www.comeet.com/jobs/${slug}/${uid}`);
  return /"token"\s*:\s*"([0-9A-F]{20,})"/i.exec(html)?.[1];
}

export function mapComeet(positions: ComeetPosition[]): RawJob[] {
  return positions.map((p) => ({
    sourceJobId: p.uid,
    url: p.url_comeet_hosted_page ?? p.url_active_page ?? undefined,
    title: p.name,
    company: p.company_name ?? undefined,
    location: [p.location?.city, p.location?.name, p.location?.is_remote ? 'remote' : '', p.workplace_type]
      .filter(Boolean)
      .join(', '),
    country: p.location?.country ?? undefined,
    description: (p.details ?? []).map((d) => d.value).join('\n'),
  }));
}

export const comeetAdapter: Adapter = async (ctx) => {
  const { uid, token: configured, hostedSlug } = comeetOptionsSchema.parse(ctx.source.options);
  const call = (token: string) =>
    ctx.http.json<ComeetPosition[]>(
      `https://www.comeet.co/careers-api/2.0/company/${uid}/positions?token=${token}&details=true`,
    );

  let token = configured ?? (hostedSlug ? await discoverToken(ctx, uid, hostedSlug) : undefined);
  if (!token) throw new Error('no Comeet token configured or discoverable');
  try {
    return mapComeet(await call(token));
  } catch (error) {
    const authProblem = error instanceof HttpError && [400, 401, 403].includes(error.status);
    if (!authProblem || !hostedSlug) throw error;
    ctx.log('Comeet token rejected — rediscovering from the hosted careers page');
    token = await discoverToken(ctx, uid, hostedSlug);
    if (!token) throw error;
    return mapComeet(await call(token));
  }
};
