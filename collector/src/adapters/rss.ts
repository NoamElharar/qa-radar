import * as cheerio from 'cheerio';
import { z } from 'zod';
import type { Adapter, RawJob } from './types.ts';

export const rssOptionsSchema = z.object({
  feedUrl: z.string().url(),
  /** WordPress feeds hold 10 items per page; follow ?paged=N up to this many pages. */
  maxPages: z.number().default(5),
});

export function parseRss(xml: string): RawJob[] {
  const $ = cheerio.load(xml, { xml: true });
  return $('item')
    .map((_, el) => {
      const item = $(el);
      const guid = item.find('guid').first().text().trim();
      const encoded = item.find('content\\:encoded').first().text();
      return {
        sourceJobId: /[?&]p=(\d+)/.exec(guid)?.[1] ?? (guid || undefined),
        url: item.find('link').first().text().trim() || undefined,
        title: item.find('title').first().text().trim(),
        description: encoded || item.find('description').first().text() || undefined,
        postedAt: item.find('pubDate').first().text().trim() || undefined,
      } satisfies RawJob;
    })
    .get()
    .filter((j) => j.title);
}

export const rssAdapter: Adapter = async ({ source, http }) => {
  const { feedUrl, maxPages } = rssOptionsSchema.parse(source.options);
  const all: RawJob[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(feedUrl);
    if (page > 1) url.searchParams.set('paged', String(page));
    let xml: string;
    try {
      xml = await http.text(url.toString(), { headers: { accept: 'application/rss+xml, application/xml, text/xml' } });
    } catch (error) {
      if (page > 1) break; // WordPress answers 404 past the last page
      throw error;
    }
    const items = parseRss(xml);
    all.push(...items);
    if (items.length < 10) break;
  }
  return all;
};
