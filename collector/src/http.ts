import robotsParser from 'robots-parser';

export const USER_AGENT =
  'QA-Radar/1.0 (+https://github.com/NoamElharar/qa-radar; personal non-commercial job search)';
/** Token matched against `User-agent:` groups in robots.txt. */
const ROBOTS_TOKEN = 'QA-Radar';

export class RobotsDisallowedError extends Error {
  constructor(url: string, message = `robots.txt disallows ${url}`) {
    super(message);
    this.name = 'RobotsDisallowedError';
  }
}

/** robots.txt could not be read (5xx / network error): we skip the host this run rather than guess. */
export class RobotsUnavailableError extends RobotsDisallowedError {
  constructor(url: string, reason: string) {
    super(url, `robots.txt unavailable for ${new URL(url).origin} (${reason}) — skipped this run to be safe`);
    this.name = 'RobotsUnavailableError';
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'HEAD';
  body?: string | URLSearchParams;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface PoliteClientOptions {
  /** Minimum gap between two requests to the same host. robots.txt Crawl-delay can raise it. */
  minDelayMs?: number;
  /** Upper bound applied to Crawl-delay so a typo in someone's robots.txt can't stall a run. */
  maxCrawlDelayMs?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

interface RobotsInfo {
  isAllowed: (url: string) => boolean;
  crawlDelayMs: number;
  /** Set when robots.txt could not be read; every URL on the host is then skipped. */
  unavailable?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Release an unread body without waiting (awaiting cancel() can hang on tee'd/cloned streams). */
function discardBody(response: Response | undefined): void {
  response?.body?.cancel().catch(() => {});
}

/**
 * Some sites put several directives on one line ("User-agent: * Disallow: /").
 * Split them so the parser sees what the site owner meant.
 */
export function normalizeRobotsTxt(text: string): string {
  return text.replace(/[ \t]+(?=(?:user-agent|disallow|allow|crawl-delay|sitemap)\s*:)/gi, '\n');
}

/**
 * HTTP client that behaves like a good citizen:
 * - checks robots.txt of every host before the first request (and refuses disallowed URLs),
 * - serializes requests per host with a minimum delay (or the site's Crawl-delay),
 * - identifies itself honestly, times out, and retries once on transient failures.
 */
export class PoliteClient {
  private readonly minDelayMs: number;
  private readonly maxCrawlDelayMs: number;
  private readonly retryDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (message: string) => void;
  private readonly robots = new Map<string, Promise<RobotsInfo>>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly nextSlot = new Map<string, number>();
  /** Number of HTTP requests made (robots.txt included) — reported in source health. */
  requestCount = 0;

  constructor(options: PoliteClientOptions = {}) {
    this.minDelayMs = options.minDelayMs ?? 2000;
    this.maxCrawlDelayMs = options.maxCrawlDelayMs ?? 15000;
    this.retryDelayMs = options.retryDelayMs ?? 3000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.log = options.log ?? (() => {});
  }

  async text(url: string, options: RequestOptions = {}): Promise<string> {
    const response = await this.request(url, options);
    return decodeBody(response);
  }

  async json<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
    const body = await this.text(url, {
      ...options,
      headers: { accept: 'application/json, */*;q=0.5', ...options.headers },
    });
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error(`Invalid JSON from ${url} (starts with: ${body.slice(0, 80)})`);
    }
  }

  /** Perform a request under the host's queue, after robots.txt approval. */
  async request(url: string, options: RequestOptions = {}): Promise<Response> {
    const target = new URL(url);
    const host = target.host;
    const release = await this.acquire(host);
    try {
      const robots = await this.getRobots(target.origin, host);
      if (robots.unavailable) throw new RobotsUnavailableError(target.href, robots.unavailable);
      if (!robots.isAllowed(target.href)) throw new RobotsDisallowedError(target.href);
      return await this.fetchWithRetry(target.href, options, host, robots.crawlDelayMs);
    } finally {
      release();
    }
  }

  private async acquire(host: string): Promise<() => void> {
    const previous = this.queues.get(host) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    this.queues.set(
      host,
      previous.then(() => current),
    );
    await previous;
    return release;
  }

  private async waitForSlot(host: string): Promise<void> {
    const wait = (this.nextSlot.get(host) ?? 0) - Date.now();
    if (wait > 0) await sleep(wait);
  }

  private markSlot(host: string, delayMs: number): void {
    this.nextSlot.set(host, Date.now() + Math.max(this.minDelayMs, delayMs));
  }

  private getRobots(origin: string, host: string): Promise<RobotsInfo> {
    let info = this.robots.get(origin);
    if (!info) {
      info = this.loadRobots(origin, host);
      this.robots.set(origin, info);
    }
    return info;
  }

  private async loadRobots(origin: string, host: string): Promise<RobotsInfo> {
    const robotsUrl = `${origin}/robots.txt`;
    await this.waitForSlot(host);
    let status = 0;
    let text = '';
    let failure = '';
    try {
      this.requestCount++;
      const res = await this.fetchImpl(robotsUrl, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/plain, */*;q=0.5' },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });
      status = res.status;
      const type = res.headers.get('content-type') ?? '';
      // A 200 HTML page here is usually a SPA fallback, not a robots file.
      if (res.ok && !type.includes('text/html')) text = await res.text();
    } catch (error) {
      status = -1;
      failure = (error as Error).message;
      this.log(`robots.txt unreachable for ${origin}: ${failure}`);
    } finally {
      this.markSlot(host, 0);
    }
    // Same policy as major crawlers: 4xx → no restrictions; 5xx/unreachable → assume disallow for now.
    if (status === -1 || status >= 500) {
      return { isAllowed: () => false, crawlDelayMs: 0, unavailable: status === -1 ? `unreachable: ${failure}` : `HTTP ${status}` };
    }
    const parsed = robotsParser(robotsUrl, normalizeRobotsTxt(text));
    const crawlDelaySec = parsed.getCrawlDelay(ROBOTS_TOKEN) ?? 0;
    return {
      isAllowed: (url) => parsed.isAllowed(url, ROBOTS_TOKEN) !== false,
      crawlDelayMs: Math.min(crawlDelaySec * 1000, this.maxCrawlDelayMs),
    };
  }

  private async fetchWithRetry(
    url: string,
    options: RequestOptions,
    host: string,
    crawlDelayMs: number,
  ): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      await this.waitForSlot(host);
      let response: Response | undefined;
      let failure: Error | undefined;
      try {
        this.requestCount++;
        response = await this.fetchImpl(url, {
          method: options.method ?? 'GET',
          body: options.body,
          redirect: 'follow',
          signal: AbortSignal.timeout(options.timeoutMs ?? 30000),
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            'accept-language': 'he-IL,he;q=0.9,en;q=0.8',
            ...options.headers,
          },
        });
      } catch (error) {
        failure = error as Error;
      } finally {
        this.markSlot(host, crawlDelayMs);
      }

      const transient =
        failure !== undefined ||
        (response !== undefined && (response.status === 429 || response.status >= 500));
      if (transient && attempt === 1) {
        const retryAfter = Number(response?.headers.get('retry-after'));
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 30000)
            : this.retryDelayMs;
        this.log(`retrying ${url} in ${delay}ms (${failure?.message ?? `HTTP ${response?.status}`})`);
        discardBody(response);
        await sleep(delay);
        continue;
      }
      if (failure) throw failure;
      if (!response!.ok) {
        discardBody(response);
        throw new HttpError(response!.status, url);
      }
      return response!;
    }
  }
}

/** Decode using the charset from Content-Type (some Israeli sites still serve windows-1255). */
export async function decodeBody(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer();
  const type = response.headers.get('content-type') ?? '';
  const charset = /charset=([^;]+)/i.exec(type)?.[1]?.trim().replace(/["']/g, '') ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}
