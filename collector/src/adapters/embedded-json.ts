import { z } from 'zod';
import type { Adapter, RawJob } from './types.ts';

/**
 * Jobs embedded as JSON inside an HTML page: Next.js `__NEXT_DATA__` or a `var jobs = [...]` script.
 * `fields` maps RawJob properties to paths in each item. Paths support dots and `[]` to flatten arrays
 * ("uWillDo[].description"). A list of paths is joined with new lines.
 */
const path = z.union([z.string(), z.array(z.string())]);

export const embeddedJsonOptionsSchema = z
  .object({
    url: z.string().url(),
    nextData: z.boolean().default(false),
    pattern: z.string().optional(),
    path: z.string().optional(),
    fields: z.object({
      id: path.optional(),
      title: path,
      url: path.optional(),
      location: path.optional(),
      description: path.optional(),
      postedAt: path.optional(),
      company: path.optional(),
    }),
    urlTemplate: z.string().optional(),
  })
  .refine((o) => o.nextData || o.pattern, { message: 'set `nextData: true` or a `pattern`' });
type Options = z.infer<typeof embeddedJsonOptionsSchema>;

export function getPath(value: unknown, dotted: string): unknown[] {
  let current: unknown[] = [value];
  for (const segment of dotted.split('.')) {
    const flatten = segment.endsWith('[]');
    const key = flatten ? segment.slice(0, -2) : segment;
    current = current.flatMap((node) => {
      if (node === null || typeof node !== 'object') return [];
      const next = (node as Record<string, unknown>)[key];
      if (flatten) return Array.isArray(next) ? next : [];
      return next === undefined ? [] : [next];
    });
  }
  return current;
}

function text(item: unknown, spec: string | string[] | undefined): string | undefined {
  if (!spec) return undefined;
  const values = (Array.isArray(spec) ? spec : [spec])
    .flatMap((p) => getPath(item, p))
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v).trim())
    .filter(Boolean);
  return values.length ? values.join('\n') : undefined;
}

export function parseEmbeddedJson(html: string, options: Options): RawJob[] {
  let jsonText: string | undefined;
  if (options.nextData) {
    jsonText = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  } else if (options.pattern) {
    jsonText = new RegExp(options.pattern).exec(html)?.[1];
  }
  if (!jsonText) throw new Error('embedded JSON not found in page (layout changed?)');
  const data: unknown = JSON.parse(jsonText);
  const items = options.path ? getPath(data, options.path)[0] : data;
  if (!Array.isArray(items)) throw new Error(`embedded JSON: "${options.path ?? '(root)'}" is not an array`);

  return items.flatMap((item): RawJob[] => {
    const title = text(item, options.fields.title);
    if (!title) return [];
    const id = text(item, options.fields.id);
    const url =
      text(item, options.fields.url) ??
      (options.urlTemplate && id ? options.urlTemplate.replace('{id}', encodeURIComponent(id)) : undefined);
    return [
      {
        sourceJobId: id,
        url,
        title,
        location: text(item, options.fields.location),
        description: text(item, options.fields.description),
        postedAt: text(item, options.fields.postedAt),
        company: text(item, options.fields.company),
      },
    ];
  });
}

export const embeddedJsonAdapter: Adapter = async ({ source, http }) => {
  const options = embeddedJsonOptionsSchema.parse(source.options);
  return parseEmbeddedJson(await http.text(options.url), options);
};
