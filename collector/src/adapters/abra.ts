import * as cheerio from 'cheerio';
import { z } from 'zod';
import { cleanText } from '../pipeline/text.ts';
import type { Adapter, RawJob } from './types.ts';

/**
 * Abra careers: the first batch is server-rendered; the theme loads the rest through WordPress
 * admin-ajax (`abra_ajax_filter_jobs`) which returns `{ html, total, loaded }`.
 */
export const abraOptionsSchema = z.object({
  url: z.string().url(),
  ajaxUrl: z.string().url(),
  category: z.string(),
});

export function parseAbraItems(html: string): RawJob[] {
  const $ = cheerio.load(html);
  return $('.career__our-careers-item')
    .map((_, el) => {
      const item = $(el);
      const link = item.find('a.title').first();
      const tags = item
        .find('ul.tags li')
        .map((__, li) => cleanText($(li).text()))
        .get();
      return {
        url: link.attr('href'),
        title: cleanText(link.text()),
        location: tags[0],
        description: [cleanText(item.find('.subtitle').text()), ...tags.slice(1)].filter(Boolean).join('\n'),
      } satisfies RawJob;
    })
    .get()
    .filter((j) => j.title && j.url);
}

export const abraAdapter: Adapter = async ({ source, http }) => {
  const { url, ajaxUrl, category } = abraOptionsSchema.parse(source.options);
  const html = await http.text(url);
  const jobs = parseAbraItems(html);
  const $ = cheerio.load(html);
  const list = $('.career__our-careers-list').first();
  const total = Number(list.attr('data-total') ?? jobs.length);
  let loaded = Number(list.attr('data-loaded') ?? jobs.length);

  while (loaded < total && loaded < 200) {
    // The theme's select is named "job_department"; send the value under both keys it may read.
    const form = new URLSearchParams({
      action: 'abra_ajax_filter_jobs',
      offset: String(loaded),
      category,
      department: category,
    });
    const res = await http.json<{ success: boolean; data?: { html: string; loaded: number } }>(ajaxUrl, {
      method: 'POST',
      body: form,
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    });
    if (!res.success || !res.data) break;
    const more = parseAbraItems(res.data.html);
    if (!more.length || res.data.loaded <= loaded) break;
    jobs.push(...more);
    loaded = res.data.loaded;
  }
  return jobs;
};
