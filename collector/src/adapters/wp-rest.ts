import { z } from 'zod';
import type { Adapter, RawJob } from './types.ts';

/** WordPress REST API for a custom post type (e.g. /wp-json/wp/v2/careers). */
export const wpRestOptionsSchema = z.object({
  baseUrl: z.string().url(),
  postType: z.string(),
  maxPages: z.number().default(10),
});

interface WpPost {
  id: number;
  date_gmt?: string;
  link: string;
  title: { rendered: string };
  content?: { rendered: string };
  excerpt?: { rendered: string };
}

export function mapWpPosts(posts: WpPost[]): RawJob[] {
  return posts.map((p) => ({
    sourceJobId: String(p.id),
    url: p.link,
    title: p.title.rendered,
    description: p.content?.rendered || p.excerpt?.rendered,
    postedAt: p.date_gmt ? `${p.date_gmt}Z` : undefined,
  }));
}

export const wpRestAdapter: Adapter = async ({ source, http }) => {
  const { baseUrl, postType, maxPages } = wpRestOptionsSchema.parse(source.options);
  const all: RawJob[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/${postType}?per_page=100&page=${page}&_fields=id,date_gmt,link,title,content,excerpt`;
    const response = await http.request(url, { headers: { accept: 'application/json' } });
    const posts = (await response.json()) as WpPost[];
    all.push(...mapWpPosts(posts));
    const totalPages = Number(response.headers.get('x-wp-totalpages') ?? '1');
    if (page >= totalPages || posts.length === 0) break;
  }
  return all;
};
