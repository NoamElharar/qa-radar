import { abraAdapter } from './abra.ts';
import { adamtotalSiteAdapter } from './adamtotal.ts';
import { comeetAdapter } from './comeet.ts';
import { embeddedJsonAdapter } from './embedded-json.ts';
import { htmlAdapter } from './html.ts';
import { base44Adapter, elalAdapter, maxAdapter, nessAdapter, redmatchAdapter } from './json-sites.ts';
import { rssAdapter } from './rss.ts';
import type { Adapter } from './types.ts';
import { wpRestAdapter } from './wp-rest.ts';

/** Adapter registry — the `adapter:` field in config/sources.yaml refers to these keys. */
export const ADAPTERS: Record<string, Adapter> = {
  html: htmlAdapter,
  'embedded-json': embeddedJsonAdapter,
  rss: rssAdapter,
  'wp-rest': wpRestAdapter,
  comeet: comeetAdapter,
  'adamtotal-site': adamtotalSiteAdapter,
  abra: abraAdapter,
  ness: nessAdapter,
  max: maxAdapter,
  base44: base44Adapter,
  elal: elalAdapter,
  redmatch: redmatchAdapter,
};

export type { Adapter, AdapterContext, RawJob } from './types.ts';
