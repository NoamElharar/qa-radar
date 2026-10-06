import * as cheerio from 'cheerio';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { z } from 'zod';
import { absoluteUrl } from '../pipeline/ids.ts';
import { cleanText } from '../pipeline/text.ts';
import type { Adapter, RawJob } from './types.ts';

/**
 * Generic, selector-driven HTML adapter. Most "B" sources are configured with it in sources.yaml.
 *
 * An extractor is either a CSS selector (text of the first match) or an object:
 *   selector  CSS selector inside the item (":self" = the item itself; omitted = the item)
 *   attr      read an attribute instead of text
 *   remove    selector of child elements to drop before reading text
 *   regex     keep capture group 1 of this regex
 *   from      "link" → apply `regex` to the extracted link instead of the DOM
 */
const extractorSchema = z.union([
  z.string(),
  z.object({
    selector: z.string().optional(),
    attr: z.string().optional(),
    remove: z.string().optional(),
    regex: z.string().optional(),
    from: z.enum(['link']).optional(),
  }),
]);
type Extractor = z.infer<typeof extractorSchema>;

export const htmlOptionsSchema = z
  .object({
    url: z.string().url(),
    item: z.string().optional(),
    title: extractorSchema.optional(),
    link: extractorSchema.optional(),
    id: extractorSchema.optional(),
    location: extractorSchema.optional(),
    endClient: extractorSchema.optional(),
    description: extractorSchema.optional(),
    postedAt: extractorSchema.optional(),
    /** Build the job URL from the id: "https://site/order/{id}/" or "{pageUrl}#{id}". */
    urlTemplate: z.string().optional(),
    /** Drop items whose title matches this regex (e.g. a privacy-policy section). */
    skipTitle: z.string().optional(),
    /**
     * Keep only items whose location matches this regex — for global careers sites that list every
     * office on one page (Mobileye: Jerusalem… but also Shanghai, Munich). Items without a location stay.
     */
    keepLocation: z.string().optional(),
    /** Query-string pagination: ?{param}=start, start+1, … until a page adds no new jobs. */
    pagination: z
      .object({ param: z.string(), start: z.number().default(1), max: z.number().default(10) })
      .optional(),
    /** Article layout: each heading is a job; the blocks after it (until the next heading) are its text. */
    headings: z.string().optional(),
    /**
     * By default a page with zero job items is reported as an error (layout changed, or the site served
     * a block page with HTTP 200). Set true for sources that can legitimately list no jobs.
     */
    allowEmpty: z.boolean().default(false),
  })
  .refine((o) => o.headings || (o.item && o.title), {
    message: 'html adapter needs either `headings` or both `item` and `title`',
  });
export type HtmlOptions = z.infer<typeof htmlOptionsSchema>;

function pick(
  $: CheerioAPI,
  item: Cheerio<AnyNode>,
  extractor: Extractor | undefined,
  { link, all = false }: { link?: string; all?: boolean } = {},
) {
  if (!extractor) return undefined;
  const spec = typeof extractor === 'string' ? { selector: extractor } : extractor;
  let value: string | undefined;
  if (spec.from === 'link') {
    value = link;
  } else {
    const matches = !spec.selector || spec.selector === ':self' ? item : item.find(spec.selector);
    const target = all ? matches : matches.first();
    if (!target.length) return undefined;
    if (spec.attr) {
      value = target.attr(spec.attr);
    } else {
      const node = spec.remove ? target.clone() : target;
      if (spec.remove) node.find(spec.remove).remove();
      node.find('br').replaceWith('\n');
      value = node
        .map((_, el) => $(el).text())
        .get()
        .join('\n');
    }
  }
  if (value === undefined) return undefined;
  if (spec.regex) {
    const m = new RegExp(spec.regex, 's').exec(value);
    value = m?.[1];
  }
  if (value && /^https?%3A/i.test(value)) value = decodeURIComponent(value);
  const cleaned = value === undefined ? undefined : cleanText(value);
  return cleaned || undefined;
}

/** Parse one HTML page with the configured selectors. Exported for fixture tests. */
export function parseHtmlJobs(html: string, pageUrl: string, options: HtmlOptions): RawJob[] {
  const $ = cheerio.load(html);
  if (options.headings) return parseHeadings($, pageUrl, options.headings);

  const jobs: RawJob[] = [];
  const skip = options.skipTitle ? new RegExp(options.skipTitle) : undefined;
  const keepLocation = options.keepLocation ? new RegExp(options.keepLocation, 'i') : undefined;
  $(options.item!).each((_, el) => {
    const item = $(el);
    const title = pick($, item, options.title);
    if (!title || skip?.test(title)) return;
    const location = pick($, item, options.location);
    if (keepLocation && location && !keepLocation.test(location)) return;
    const rawLink = pick($, item, options.link);
    let url = rawLink ? absoluteUrl(rawLink, pageUrl) : undefined;
    const id = pick($, item, options.id, { link: url ?? rawLink });
    if (options.urlTemplate && id) {
      url = options.urlTemplate.replace('{id}', encodeURIComponent(id)).replace('{pageUrl}', pageUrl);
    }
    jobs.push({
      sourceJobId: id,
      url,
      title,
      location,
      endClient: pick($, item, options.endClient),
      description: pick($, item, options.description, { all: true }),
      postedAt: pick($, item, options.postedAt),
    });
  });
  return jobs;
}

/** Article pages that list jobs as "heading + paragraphs" (e.g. Reshet 13). */
function parseHeadings($: CheerioAPI, pageUrl: string, headingSelector: string): RawJob[] {
  const jobs: RawJob[] = [];
  const headings = $(headingSelector);
  headings.each((_, el) => {
    const heading = $(el);
    const title = cleanText(heading.text());
    if (!title) return;
    // Walk up to the block that is a direct sibling of the other job blocks.
    let block = heading;
    while (block.parent().length && block.parent().find(headingSelector.split(' ').pop()!).length === 1) {
      block = block.parent();
    }
    const parts: string[] = [];
    for (let next = block.next(); next.length; next = next.next()) {
      if (next.is(headingSelector.split(' ').pop()!) || next.find(headingSelector.split(' ').pop()!).length) break;
      parts.push(next.text());
    }
    jobs.push({ title, url: pageUrl, description: cleanText(parts.join('\n')) || undefined });
  });
  return jobs;
}

function assertNotEmpty(jobs: RawJob[], options: HtmlOptions): RawJob[] {
  if (!jobs.length && !options.allowEmpty) {
    throw new Error(
      `no job items matched "${options.headings ?? options.item}" — the page layout changed or the site served a block page`,
    );
  }
  return jobs;
}

export const htmlAdapter: Adapter = async ({ source, http, log }) => {
  const options = htmlOptionsSchema.parse(source.options);
  if (!options.pagination) {
    return assertNotEmpty(parseHtmlJobs(await http.text(options.url), options.url, options), options);
  }
  const { param, start, max } = options.pagination;
  const all: RawJob[] = [];
  const seen = new Set<string>();
  for (let page = start; page < start + max; page++) {
    const pageUrl = new URL(options.url);
    pageUrl.searchParams.set(param, String(page));
    const jobs = parseHtmlJobs(await http.text(pageUrl.toString()), pageUrl.toString(), options);
    const fresh = jobs.filter((j) => {
      const key = j.sourceJobId ?? j.url ?? j.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    all.push(...fresh);
    if (!fresh.length) break;
    if (page === start + max - 1) log(`stopped at pagination limit (${max} pages)`);
  }
  return assertNotEmpty(all, options);
};
