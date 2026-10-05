import * as cheerio from 'cheerio';
import { z } from 'zod';
import { cleanText } from '../pipeline/text.ts';
import type { Adapter, RawJob } from './types.ts';

/**
 * OZ Software careers: a WordPress + WPML theme whose "load more" button calls admin-ajax
 * (`ozs_load_more_posts`) and gets back every job card as an HTML fragment. robots.txt explicitly
 * allows admin-ajax. The language comes from WPML's cookie (a Hebrew visitor has it set), so we send
 * the same cookie to get the Hebrew listing instead of the 2 English jobs.
 */
export const wpmlAjaxOptionsSchema = z.object({
  ajaxUrl: z.string().url(),
  /** Numeric id of the careers page (the `data-page-id` of its job grid). */
  pageId: z.number(),
  postType: z.string().default('career'),
  language: z.string().default('he'),
  /** Upper bound for one request; the site returns everything up to this many. */
  perPage: z.number().default(500),
});

const CATEGORY_NOISE = /^(col-|career-teaser|float-)/;

interface AjaxPayload {
  success?: boolean;
  loaded_posts?: string;
  loaded_count?: number;
  total_count?: number;
}

/**
 * Parse the job cards. Each card's CSS classes are the job's categories ("software-qa", "automation"…),
 * which are passed on as plain words so the classifier can use them as context for ambiguous titles.
 */
export function parseOzCards(fragment: string): RawJob[] {
  const $ = cheerio.load(fragment);
  return $('.career-teaser')
    .map((_, el) => {
      const card = $(el);
      const link = card.find('a[href]').first().attr('href');
      const classes = (card.attr('class') ?? '')
        .split(/\s+/)
        .filter((c) => c && !CATEGORY_NOISE.test(c));
      const categories = classes
        .filter((c) => /^[a-z-]+$/.test(c))
        .map((c) => c.replace(/-/g, ' '));
      return {
        sourceJobId: link?.match(/\/jb-(\d+)/)?.[1],
        url: link,
        title: cleanText(card.find('h2').first().text()),
        location: cleanText(card.find('.location').first().text()) || undefined,
        description: [cleanText(card.find('.excerpt').first().text()), categories.join(', ')]
          .filter(Boolean)
          .join('\n'),
      } satisfies RawJob;
    })
    .get()
    .filter((job) => job.title && job.url);
}

export const wpmlAjaxAdapter: Adapter = async ({ source, http }) => {
  const options = wpmlAjaxOptionsSchema.parse(source.options);
  const url = new URL(options.ajaxUrl);
  url.search = new URLSearchParams({
    action: 'ozs_load_more_posts',
    page_id: String(options.pageId),
    displaying: '0',
    posts_per_page: String(options.perPage),
    post_type: options.postType,
  }).toString();
  const data = await http.json<AjaxPayload>(url.toString(), {
    headers: { cookie: `wp-wpml_current_language=${options.language}` },
  });
  if (!data.success || typeof data.loaded_posts !== 'string') {
    throw new Error(
      'Oz load-more endpoint returned success=false (the site changed its AJAX action?)',
    );
  }
  const jobs = parseOzCards(data.loaded_posts);
  // The site reports its own total — if we parsed fewer cards, the markup changed.
  if (typeof data.total_count === 'number' && jobs.length < data.total_count) {
    throw new Error(`parsed ${jobs.length} of ${data.total_count} Oz jobs — card markup changed?`);
  }
  if (!jobs.length)
    throw new Error('Oz returned no jobs (language cookie ignored, or the site changed)');
  return jobs;
};
