import { z } from 'zod';
import type { Adapter, RawJob } from './types.ts';

/**
 * Small adapters for sites that feed their careers page from their own JSON endpoint.
 * Each one maps a site-specific payload to RawJob.
 */

// ── NESS: /careers/api/Careers/GetAllItems ─────────────────────────────────────────
interface NessItem {
  index: string;
  title: string;
  posLocation?: string;
  posDescription?: string;
  lastUpdated?: string;
  profName?: string;
  subProfName?: string;
}

export function mapNess(items: NessItem[], jobUrl: string): RawJob[] {
  // Recruiter names/emails in the payload are intentionally not copied.
  return items.map((i) => ({
    sourceJobId: i.index,
    url: `${jobUrl}#${i.index}`,
    title: i.title,
    location: i.posLocation,
    description: [i.profName, i.subProfName, i.posDescription].filter(Boolean).join('\n'),
  }));
}

export const nessAdapter: Adapter = async ({ source, http }) => {
  const { url, jobUrl } = z.object({ url: z.string().url(), jobUrl: z.string().url() }).parse(source.options);
  const data = await http.json<{ allOrderDetailsList?: NessItem[] }>(url);
  if (!Array.isArray(data.allOrderDetailsList)) throw new Error('unexpected NESS payload');
  return mapNess(data.allOrderDetailsList, jobUrl);
};

// ── MAX: /api/lobby/getLobby?lobbyName=jobs&page=N ─────────────────────────────────
interface MaxLobby {
  result?: {
    categories?: Array<{ pages?: { isLast?: boolean; pages?: Array<{ title?: string; linkUrl?: string }> } }>;
  };
}

export function mapMax(lobby: MaxLobby): { jobs: RawJob[]; isLast: boolean } {
  const category = lobby.result?.categories?.[0];
  const pages = category?.pages?.pages ?? [];
  return {
    isLast: category?.pages?.isLast ?? true,
    jobs: pages
      .filter((p) => p.title && p.linkUrl)
      .map((p) => {
        const url = new URL(p.linkUrl!);
        url.searchParams.delete('SourceGA');
        return { sourceJobId: url.pathname.split('/').filter(Boolean).pop(), url: url.toString(), title: p.title! };
      }),
  };
}

export const maxAdapter: Adapter = async ({ source, http }) => {
  const { url } = z.object({ url: z.string().url() }).parse(source.options);
  const all: RawJob[] = [];
  for (let page = 0; page < 10; page++) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set('page', String(page));
    const { jobs, isLast } = mapMax(await http.json<MaxLobby>(pageUrl.toString()));
    all.push(...jobs);
    if (isLast || !jobs.length) break;
  }
  return all;
};

// ── Base44: base44.app functions/getJobs ───────────────────────────────────────────
interface Base44Job {
  id: string;
  title: string;
  location?: string;
  department?: string;
  team?: string;
  description?: string;
  requirements?: string;
  apply_url?: string;
}

export const base44Adapter: Adapter = async ({ source, http }) => {
  const { url } = z.object({ url: z.string().url() }).parse(source.options);
  const jobs = await http.json<Base44Job[]>(url);
  return jobs.map((j) => {
    let link = j.apply_url;
    if (link) {
      const u = new URL(link);
      u.search = '';
      link = u.toString();
    }
    return {
      sourceJobId: j.id,
      url: link ?? `https://careers.base44.com/job?id=${encodeURIComponent(j.id)}`,
      title: j.title,
      location: j.location,
      description: [j.department, j.description, j.requirements].filter(Boolean).join('\n'),
    };
  });
};

// ── El Al: Umbraco content API (job "banners" grouped by category) ─────────────────
interface ElalBanner {
  title?: string;
  link?: { url?: string };
}

export function collectElalBanners(node: unknown, out: ElalBanner[] = []): ElalBanner[] {
  if (Array.isArray(node)) node.forEach((n) => collectElalBanners(n, out));
  else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const link = obj.link as ElalBanner['link'];
    if (typeof obj.title === 'string' && link?.url && /adamtotal|career|job/i.test(link.url)) {
      out.push({ title: obj.title, link });
    }
    Object.values(obj).forEach((v) => collectElalBanners(v, out));
  }
  return out;
}

export const elalAdapter: Adapter = async ({ source, http }) => {
  const { url } = z.object({ url: z.string().url(), jobsPage: z.string().url() }).parse(source.options);
  const data = await http.json<unknown>(url);
  return collectElalBanners(data).map((b) => ({
    url: b.link!.url!,
    title: b.title!.trim(),
  }));
};

// ── Clalit: RedMatch ATS position search ───────────────────────────────────────────
interface RedMatchPosition {
  compPositionID: number | string;
  jobTitleText?: string;
  extJobTitleText?: string;
  displayLocation?: string;
  affiliateDisplayName?: string;
  description?: string;
  shortDescription?: string;
  fieldDesc?: string;
  activationDate?: string;
}

export const redmatchAdapter: Adapter = async ({ source, http }) => {
  const options = z
    .object({ searchUrl: z.string().url(), countryId: z.number(), jobsPage: z.string().url() })
    .parse(source.options);
  const body = JSON.stringify({ KeyWords: '', CategoryId: ['0'], countryId: options.countryId, cityId: [] });
  const data = await http.json<{ responseStatus: number; positions?: RedMatchPosition[] }>(options.searchUrl, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });
  if (data.responseStatus !== 0 || !Array.isArray(data.positions)) {
    throw new Error(`RedMatch search failed (responseStatus ${data.responseStatus})`);
  }
  return data.positions.map((p) => ({
    sourceJobId: String(p.compPositionID),
    url: `${options.jobsPage}#pid-${p.compPositionID}`,
    title: (p.jobTitleText ?? p.extJobTitleText ?? '').trim(),
    company: p.affiliateDisplayName ? `כללית · ${p.affiliateDisplayName}` : undefined,
    location: p.displayLocation,
    description: [p.fieldDesc, p.shortDescription, p.description].filter(Boolean).join('\n'),
    postedAt: p.activationDate,
  }));
};
