import { z } from 'zod';
import type { Adapter, RawJob } from './types.ts';

/**
 * Jobs as JSON: embedded in an HTML page (Next.js `__NEXT_DATA__`, a `var jobs = [...]` script) or
 * served directly by the site's own content API (`api: true`).
 * `fields` maps RawJob properties to paths in each item. Paths support dots and `[]` to flatten arrays
 * ("uWillDo[].description"). A list of paths is joined with new lines.
 */
const path = z.union([z.string(), z.array(z.string())]);

export const embeddedJsonOptionsSchema = z
  .object({
    url: z.string().url(),
    nextData: z.boolean().default(false),
    pattern: z.string().optional(),
    /** The URL answers with JSON (a CMS content API) rather than an HTML page. */
    api: z.boolean().default(false),
    path: z.string().optional(),
    /**
     * Find the job list by key name anywhere in the document (first array under that key). For CMS
     * pages whose block order changes ("body.columns[0].entries[1].jobsBank").
     */
    findKey: z.string().optional(),
    fields: z.object({
      id: path.optional(),
      title: path,
      url: path.optional(),
      location: path.optional(),
      description: path.optional(),
      postedAt: path.optional(),
      company: path.optional(),
      /** Country code or name; jobs outside Israel are dropped during normalization. */
      country: path.optional(),
    }),
    /** Job URL from the item: "{id}" is the extracted id, any other "{path}" reads that item field. */
    urlTemplate: z.string().optional(),
  })
  .refine((o) => o.nextData || o.pattern || o.api, {
    message: 'set `nextData: true`, `api: true` or a `pattern`',
  });
type Options = z.input<typeof embeddedJsonOptionsSchema>;

/** Depth-first search for the first array stored under `key`. */
export function findArray(value: unknown, key: string): unknown[] | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findArray(child, key);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record[key])) return record[key];
  for (const child of Object.values(record)) {
    const found = findArray(child, key);
    if (found) return found;
  }
  return undefined;
}

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

function fillTemplate(template: string, item: unknown, id: string | undefined): string | undefined {
  let missing = false;
  const url = template.replace(/\{([\w.]+)\}/g, (_, key: string) => {
    const value = key === 'id' ? id : text(item, key);
    if (!value) missing = true;
    return encodeURIComponent(value ?? '');
  });
  return missing ? undefined : url;
}

export function parseEmbeddedJson(body: string, options: Options): RawJob[] {
  let jsonText: string | undefined;
  if (options.api) {
    jsonText = body;
  } else if (options.nextData) {
    jsonText = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(body)?.[1];
  } else if (options.pattern) {
    jsonText = new RegExp(options.pattern).exec(body)?.[1];
  }
  if (!jsonText) throw new Error('embedded JSON not found in page (layout changed?)');
  if (options.api && /^\s*</.test(jsonText)) {
    throw new Error('the API answered with an HTML page instead of JSON (bot protection or a moved API)');
  }
  const data: unknown = JSON.parse(jsonText);
  const items = options.findKey
    ? findArray(data, options.findKey)
    : options.path
      ? getPath(data, options.path)[0]
      : data;
  if (!Array.isArray(items)) {
    throw new Error(
      `embedded JSON: "${options.findKey ?? options.path ?? '(root)'}" is not an array`,
    );
  }

  return items.flatMap((item): RawJob[] => {
    const title = text(item, options.fields.title);
    if (!title) return [];
    const id = text(item, options.fields.id);
    const url =
      text(item, options.fields.url) ??
      (options.urlTemplate ? fillTemplate(options.urlTemplate, item, id) : undefined);
    return [
      {
        sourceJobId: id,
        url,
        title,
        location: text(item, options.fields.location),
        description: text(item, options.fields.description),
        postedAt: text(item, options.fields.postedAt),
        company: text(item, options.fields.company),
        country: text(item, options.fields.country),
      },
    ];
  });
}

export const embeddedJsonAdapter: Adapter = async ({ source, http }) => {
  const options = embeddedJsonOptionsSchema.parse(source.options);
  return parseEmbeddedJson(await http.text(options.url), options);
};
