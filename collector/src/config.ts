import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CONFIG_DIR = fileURLToPath(new URL('../../config/', import.meta.url));

const regionId = z.enum(['center', 'shfela', 'sharon', 'jerusalem', 'north', 'south', 'remote']);

const quickLink = z.object({ label: z.string(), url: z.string().url() });

export const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'source ids are lower-case slugs'),
  name: z.string(),
  company: z.string().optional(),
  type: z.enum(['direct', 'agency', 'board']),
  tier: z.enum(['A', 'B', 'D']),
  adapter: z.string(),
  enabled: z.boolean().default(true),
  homepage: z.string().url(),
  everyHours: z.number().positive().default(1),
  categoryQa: z.boolean().default(false),
  note: z.string().optional(),
  quickLinks: z.array(quickLink).optional(),
  options: z.record(z.unknown()).default({}),
});
export type SourceConfig = z.infer<typeof sourceSchema>;

const sourcesFileSchema = z.object({ sources: z.array(sourceSchema) }).superRefine((file, ctx) => {
  const seen = new Set<string>();
  for (const s of file.sources) {
    if (seen.has(s.id)) ctx.addIssue({ code: 'custom', message: `duplicate source id "${s.id}"` });
    seen.add(s.id);
    if (s.tier === 'D' && s.adapter !== 'link-out') {
      ctx.addIssue({ code: 'custom', message: `${s.id}: tier D sources must use adapter "link-out"` });
    }
  }
});

const termList = z.array(z.string()).default([]);

export const taxonomySchema = z.object({
  qa: z.object({
    strong: termList,
    weak: termList,
    context: termList,
    /** Description words that mark an ambiguous ("weak") title as non-software work. */
    notSoftware: termList,
    exclude: termList,
  }),
  tags: z.array(
    z.object({ label: z.string(), terms: termList, field: z.enum(['title', 'all']).default('all') }),
  ),
  seniority: z.object({
    management: termList,
    senior: termList,
    junior: termList,
    mid: termList,
  }),
});
export type Taxonomy = z.infer<typeof taxonomySchema>;

export const regionsSchema = z.object({
  regions: z.record(regionId, z.object({ label: z.string(), aliases: termList })),
  cities: z.array(
    z.object({
      name: z.string(),
      regions: z.array(regionId).min(1),
      lat: z.number(),
      lon: z.number(),
      aliases: termList,
      nameIsAmbiguous: z.boolean().default(false),
    }),
  ),
});
export type RegionsConfig = z.infer<typeof regionsSchema>;

const labeledTerms = z.array(z.object({ label: z.string(), terms: termList }));

export const profileSchema = z.object({
  home: z.string(),
  yearsExperience: z.number().min(0),
  targetRegions: z.array(regionId),
  skills: labeledTerms,
  gaps: labeledTerms,
  bonusTags: z.record(z.number()).default({}),
});
export type Profile = z.infer<typeof profileSchema>;

function loadYaml<T>(file: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const raw: unknown = parse(readFileSync(`${CONFIG_DIR}${file}`, 'utf8'));
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid config/${file}:\n${issues}`);
  }
  return result.data;
}

export interface AppConfig {
  sources: SourceConfig[];
  taxonomy: Taxonomy;
  regions: RegionsConfig;
  profile: Profile;
}

export function loadConfig(): AppConfig {
  return {
    sources: loadYaml('sources.yaml', sourcesFileSchema).sources,
    taxonomy: loadYaml('taxonomy.yaml', taxonomySchema),
    regions: loadYaml('regions.yaml', regionsSchema),
    profile: loadYaml('profile.yaml', profileSchema),
  };
}
