import { createHash } from 'node:crypto';

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|mc_\w+|sid|oga|sourcega|ref|referral|source)$/i;

/** Short, stable hash for ids. */
export function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 12);
}

/** Canonical form of a job URL: lower-case host, no tracking params, no trailing slash noise. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase();
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    let href = u.toString();
    if (href.endsWith('/') && u.pathname !== '/') href = href.slice(0, -1);
    return href;
  } catch {
    return url.trim();
  }
}

/** Resolve a possibly relative link against the page it was found on. */
export function absoluteUrl(href: string, base: string): string | undefined {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('javascript:') || trimmed === '#') return undefined;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return undefined;
  }
}
