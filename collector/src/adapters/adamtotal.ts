import * as cheerio from 'cheerio';
import { z } from 'zod';
import { absoluteUrl } from '../pipeline/ids.ts';
import { cleanText } from '../pipeline/text.ts';
import type { Adapter, RawJob } from './types.ts';

/**
 * Adam Milo "adamtotal" hosted career sites (career.adamtotal.co.il, railcareer.adamtotal.co.il…).
 * Server-rendered job cards with PagedList pagination (?page=N).
 */
export const adamtotalSiteOptionsSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string(),
  params: z.record(z.string()).default({}),
  maxPages: z.number().default(5),
});

export function parseAdamtotalPage(html: string, pageUrl: string): RawJob[] {
  const $ = cheerio.load(html);
  return $('article.job-card')
    .map((_, el) => {
      const card = $(el);
      const id = card.attr('data-job-id');
      const title = cleanText(card.attr('data-job-title') ?? card.find('.job-title-button').first().text());
      const meta = card
        .find('.job-meta span')
        .map((__, s) => cleanText($(s).text()))
        .get()
        .filter((t) => !/^מס/.test(t));
      const href = card.find('a.job-detail-link').first().attr('href');
      return {
        sourceJobId: id,
        url: href ? absoluteUrl(href, pageUrl) : undefined,
        title,
        location: meta.join(' | ').replace(/\s*\|\s*$/, ''),
        description: cleanText(card.find('.job-snippet, .job-description-collapse, .description-text').first().text()) || undefined,
      } satisfies RawJob;
    })
    .get()
    .filter((j) => j.title);
}

export const adamtotalSiteAdapter: Adapter = async ({ source, http }) => {
  const { baseUrl, token, params, maxPages } = adamtotalSiteOptionsSchema.parse(source.options);
  const all: RawJob[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL('/Home/Index', baseUrl);
    url.searchParams.set('token', token);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (page > 1) url.searchParams.set('page', String(page));
    const html = await http.text(url.toString());
    const jobs = parseAdamtotalPage(html, url.toString()).filter((j) => {
      const key = j.sourceJobId ?? j.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    all.push(...jobs);
    const hasNext = /PagedList-skipToNext(?![^"]*disabled)/.test(html) && !/class="[^"]*disabled[^"]*PagedList-skipToNext/.test(html);
    if (!jobs.length || !hasNext) break;
  }
  return all;
};
