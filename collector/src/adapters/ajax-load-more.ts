import * as cheerio from 'cheerio';
import { htmlOptionsSchema, parseHtmlJobs } from './html.ts';
import type { Adapter, RawJob } from './types.ts';

/**
 * WordPress sites whose job list comes from the "Ajax Load More" plugin (Log-On). The search page
 * itself only carries the query: its `.alm-listing` element names the post type and — for a filtered
 * search such as `?areas=…` — the exact job ids (`data-post-in`). The jobs are then fetched from
 * admin-ajax (`alm_get_posts`) page by page, the same requests the "more jobs" button makes, and each
 * HTML page is parsed with the html adapter's selectors (`item`, `title`, `link`, `id`…).
 */

/** Stop after this many pages even if the site reports more (a runaway query, not a job list). */
const MAX_PAGES = 20;

interface AlmPayload {
  html?: string;
  meta?: { postcount?: number; totalposts?: number };
}

/** The query the search page hands to the plugin. Exported for fixture tests. */
export function readAlmQuery(page: string): Record<string, string> {
  const listing = cheerio.load(page)('.alm-listing').first();
  if (!listing.length) {
    throw new Error('no Ajax Load More listing on the search page — the page layout changed');
  }
  const data = (name: string) => listing.attr(`data-${name}`) ?? '';
  const postIn = data('post-in');
  if (!postIn) {
    // Without ids the plugin would return every job on the site, not the filtered search.
    throw new Error('the search page lists no job ids (data-post-in) — the filter or the page changed');
  }
  return {
    action: 'alm_get_posts',
    query_type: 'standard',
    post_type: data('post-type') || 'post',
    post__in: postIn,
    post__not_in: data('post-not-in'),
    meta_key: data('meta-key'),
    order: data('order') || 'DESC',
    orderby: data('orderby') || 'date',
    posts_per_page: data('posts-per-page') || '10',
    repeater: 'default',
    theme_repeater: data('theme-repeater'),
    offset: '0',
  };
}

export const ajaxLoadMoreAdapter: Adapter = async ({ source, http }) => {
  const options = htmlOptionsSchema.parse(source.options);
  const query = readAlmQuery(await http.text(options.url));
  const ajaxUrl = new URL('/wp-admin/admin-ajax.php', options.url);

  const jobs: RawJob[] = [];
  const seen = new Set<string>();
  let total = Infinity;
  for (let page = 0; page < MAX_PAGES && seen.size < total; page++) {
    ajaxUrl.search = new URLSearchParams({ ...query, page: String(page) }).toString();
    const data = await http.json<AlmPayload>(ajaxUrl.toString());
    if (typeof data.html !== 'string') {
      throw new Error('admin-ajax returned no HTML (the plugin changed its response?)');
    }
    total = data.meta?.totalposts ?? 0;
    const parsed = parseHtmlJobs(data.html, options.url, options);
    // The plugin says how many posts it rendered — fewer parsed jobs means the markup changed.
    if (typeof data.meta?.postcount === 'number' && parsed.length < data.meta.postcount) {
      throw new Error(`parsed ${parsed.length} of ${data.meta.postcount} jobs on page ${page} — job markup changed?`);
    }
    const fresh = parsed.filter((j) => {
      const key = j.sourceJobId ?? j.url ?? j.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!fresh.length) break;
    jobs.push(...fresh);
  }
  if (!jobs.length) throw new Error('Ajax Load More returned no jobs for the search');
  if (jobs.length < total) throw new Error(`got ${jobs.length} of ${total} jobs — paging stopped early`);
  return jobs;
};
