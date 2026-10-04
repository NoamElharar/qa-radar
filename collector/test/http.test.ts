import { describe, expect, it } from 'vitest';
import {
  HttpError,
  normalizeRobotsTxt,
  PoliteClient,
  RobotsDisallowedError,
  RobotsUnavailableError,
  USER_AGENT,
} from '../src/http.ts';

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Fake fetch that records calls (with timestamps) and answers from a route table. */
function fakeFetch(routes: Record<string, Route | Response>) {
  const calls: Array<{ url: string; at: number; ua?: string }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, at: Date.now(), ua: (init?.headers as Record<string, string> | undefined)?.['user-agent'] });
    const route = routes[url];
    if (!route) return new Response('not found', { status: 404 });
    return typeof route === 'function' ? route(url, init) : route.clone();
  }) as typeof fetch;
  return { impl, calls };
}

const text = (body: string, status = 200, type = 'text/plain') =>
  new Response(body, { status, headers: { 'content-type': type } });

describe('PoliteClient', () => {
  it('refuses URLs disallowed by robots.txt — before requesting them', async () => {
    const { impl, calls } = fakeFetch({
      'https://site.test/robots.txt': text('User-agent: *\nDisallow: /api/'),
      'https://site.test/api/jobs': text('{}'),
    });
    const client = new PoliteClient({ fetchImpl: impl, minDelayMs: 0 });
    await expect(client.text('https://site.test/api/jobs')).rejects.toBeInstanceOf(RobotsDisallowedError);
    expect(calls.map((c) => c.url)).toEqual(['https://site.test/robots.txt']);
  });

  it('understands one-line robots files ("User-agent: * Disallow: /")', async () => {
    expect(normalizeRobotsTxt('User-agent: * Disallow: /')).toBe('User-agent: *\nDisallow: /');
    const { impl } = fakeFetch({ 'https://api.test/robots.txt': text('User-agent: * Disallow: /'), 'https://api.test/x': text('ok') });
    await expect(new PoliteClient({ fetchImpl: impl, minDelayMs: 0 }).text('https://api.test/x')).rejects.toBeInstanceOf(
      RobotsDisallowedError,
    );
  });

  it('treats a missing robots.txt (404) as allow-all, and an SPA HTML fallback as empty', async () => {
    const { impl } = fakeFetch({
      'https://a.test/jobs': text('A'),
      'https://b.test/robots.txt': text('<html>app</html>', 200, 'text/html'),
      'https://b.test/jobs': text('B'),
    });
    const client = new PoliteClient({ fetchImpl: impl, minDelayMs: 0 });
    expect(await client.text('https://a.test/jobs')).toBe('A');
    expect(await client.text('https://b.test/jobs')).toBe('B');
  });

  it('assumes disallow when robots.txt errors (5xx), like major crawlers — with a clear reason', async () => {
    const { impl, calls } = fakeFetch({ 'https://down.test/robots.txt': text('oops', 503), 'https://down.test/jobs': text('x') });
    const attempt = new PoliteClient({ fetchImpl: impl, minDelayMs: 0 }).text('https://down.test/jobs');
    await expect(attempt).rejects.toBeInstanceOf(RobotsUnavailableError);
    await expect(attempt).rejects.toThrow(/robots\.txt unavailable for https:\/\/down\.test \(HTTP 503\)/);
    expect(calls.map((c) => c.url)).toEqual(['https://down.test/robots.txt']);
  });

  it('spaces requests to the same host and honours Crawl-delay', async () => {
    const { impl, calls } = fakeFetch({
      'https://slow.test/robots.txt': text('User-agent: *\nCrawl-delay: 0.2'),
      'https://slow.test/1': text('1'),
      'https://slow.test/2': text('2'),
    });
    const client = new PoliteClient({ fetchImpl: impl, minDelayMs: 50 });
    await Promise.all([client.text('https://slow.test/1'), client.text('https://slow.test/2')]);
    const [, first, second] = calls;
    expect(second!.at - first!.at).toBeGreaterThanOrEqual(190);
  });

  it('does not make different hosts wait for each other', async () => {
    const { impl, calls } = fakeFetch({ 'https://x.test/a': text('a'), 'https://y.test/a': text('a') });
    const client = new PoliteClient({ fetchImpl: impl, minDelayMs: 300 });
    const started = Date.now();
    await Promise.all([client.text('https://x.test/a'), client.text('https://y.test/a')]);
    // Each host: robots.txt, wait 300ms, page. In parallel → ~300ms, not ~600ms.
    expect(Date.now() - started).toBeLessThan(550);
    expect(calls).toHaveLength(4);
  });

  it('identifies itself honestly', async () => {
    const { impl, calls } = fakeFetch({ 'https://ua.test/p': text('p') });
    await new PoliteClient({ fetchImpl: impl, minDelayMs: 0 }).text('https://ua.test/p');
    expect(calls.every((c) => c.ua === USER_AGENT)).toBe(true);
    expect(USER_AGENT).toMatch(/^QA-Radar\/\d/);
  });

  it('retries once on a transient 5xx, then gives up with HttpError', async () => {
    let attempts = 0;
    const { impl } = fakeFetch({
      'https://flaky.test/p': () => (++attempts === 1 ? text('busy', 503) : text('ok')),
      'https://broken.test/p': text('nope', 500),
    });
    const client = new PoliteClient({ fetchImpl: impl, minDelayMs: 0, retryDelayMs: 10 });
    expect(await client.text('https://flaky.test/p')).toBe('ok');
    await expect(client.text('https://broken.test/p')).rejects.toBeInstanceOf(HttpError);
  });

  it('decodes windows-1255 pages', async () => {
    const bytes = new Uint8Array([0xe1, 0xe5, 0xe3, 0xf7]); // "בודק" in windows-1255
    const { impl } = fakeFetch({
      'https://legacy.test/p': new Response(bytes, { headers: { 'content-type': 'text/html; charset=windows-1255' } }),
    });
    expect(await new PoliteClient({ fetchImpl: impl, minDelayMs: 0 }).text('https://legacy.test/p')).toBe('בודק');
  });
});
