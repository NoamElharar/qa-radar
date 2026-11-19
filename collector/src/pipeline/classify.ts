import {
  compileTerms,
  normalizeText,
  scoreJob,
  termToRegExp,
  type RegionId,
  type ScoringConfig,
  type Seniority,
} from '@qa-radar/shared';
import type { AppConfig, Profile } from '../config.ts';

export interface QaDecision {
  qa: boolean;
  /** Short machine-readable reason, e.g. "strong:QA", "exclude:QC", "weak+context:API". */
  reason: string;
}

export interface Classification {
  tags: string[];
  seniority: Seniority;
  yearsRequired?: number;
  city?: string;
  regions: RegionId[];
  distanceKm?: number;
  score: number;
  matched: string[];
  missing: string[];
  /** Every known skill the job mentions (see `scoringConfigOf`), whether or not I have it. */
  requires: string[];
}

/**
 * The skills the radar recognises and the profile's scoring rules, as written into jobs.json for the
 * dashboard. The skills are the profile's "have" list followed by its "gaps" list, so a job's
 * `requires` keeps the order the ✓ and ✗ lists have always had.
 */
export function scoringConfigOf(profile: Profile): ScoringConfig {
  return {
    skills: [...profile.skills, ...profile.gaps].map((s) => ({ label: s.label, terms: [...s.terms] })),
    have: profile.skills.map((s) => s.label),
    yearsExperience: profile.yearsExperience,
    bonusTags: { ...profile.bonusTags },
  };
}

export interface ClassifyInput {
  title: string;
  description?: string;
  location?: string;
}

export interface Classifier {
  decideQa(title: string, description: string | undefined, categoryQa: boolean): QaDecision;
  /** Cheap title-only pre-check used by adapters to decide whether fetching details is worthwhile. */
  isQaCandidate(title: string): boolean;
  classify(input: ClassifyInput): Classification;
}

const REGION_WORDS: Record<string, RegionId> = {
  מרכז: 'center',
  שפלה: 'shfela',
  שרון: 'sharon',
  צפון: 'north',
  דרום: 'south',
};
/** "באזור המרכז", "במרכז", "לאזור השרון", "גוש דן" inside free text (titles/descriptions). */
const REGION_PHRASE =
  /(?<![א-ת])(?:(?:ב|ל|מ)?אזור\s+|ב|ל)ה?(מרכז|שפלה|שרון|צפון|דרום)(?![א-ת])|(?<![א-ת])[בל]?גוש\s+דן(?![א-ת])/g;

/**
 * A negation right before a remote-work word: "ללא עבודה היברידית", "אין אפשרות לעבודה מהבית",
 * "no remote". At most two plain words in between, so "ללא תואר, עבודה היברידית" (no degree needed,
 * hybrid work) still counts as hybrid. A bare "לא" is left out: "לא רק מהבית" (not only from home) is hybrid.
 */
const NEGATION_BEFORE = /(?<![א-ת\w])ו?(?:ללא|בלי|אין|no|without)(?:\s+[^\s,.;:!?()|•/-]+){0,2}\s+$/;

const EXPERIENCE_WORD =/ניסיון|נסיון|ותק|experience/;
const YEARS_NUMERIC =
  /(\d{1,2})\s*\+?\s*(?:(?:-|עד)\s*\d{1,2}\s*\+?\s*)?(?:שנות|שנים|שנה|years?|yrs)(?![א-ת])/g;
const YEARS_WORDS: Array<[RegExp, number]> = [
  [/שנתיים/g, 2],
  [/(?:שנת|שנה)\s+(?:אחת\s+)?(?:של\s+)?(?:ניסיון|נסיון)/g, 1],
  [/שלוש\s+שנ/g, 3],
  [/ארבע\s+שנ/g, 4],
  [/חמש\s+שנ/g, 5],
  [/שש\s+שנ/g, 6],
];

/** Highest "years of experience" requirement mentioned near an experience keyword (ranges use their minimum). */
export function parseYearsRequired(normalized: string): number | undefined {
  let best: number | undefined;
  const consider = (value: number, index: number, length: number) => {
    if (value < 1 || value > 15) return;
    const window = normalized.slice(Math.max(0, index - 60), index + length + 60);
    if (!EXPERIENCE_WORD.test(window)) return;
    best = best === undefined ? value : Math.max(best, value);
  };
  for (const m of normalized.matchAll(YEARS_NUMERIC)) consider(Number(m[1]), m.index, m[0].length);
  for (const [re, value] of YEARS_WORDS) {
    for (const m of normalized.matchAll(re)) consider(value, m.index, m[0].length);
  }
  return best;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function createClassifier(config: AppConfig): Classifier {
  const { taxonomy, regions, profile } = config;

  const qa = {
    strong: compileTerms(taxonomy.qa.strong),
    weak: compileTerms(taxonomy.qa.weak),
    context: compileTerms(taxonomy.qa.context),
    notSoftware: compileTerms(taxonomy.qa.notSoftware),
    exclude: compileTerms(taxonomy.qa.exclude),
  };
  const tags = taxonomy.tags.map((t) => ({ ...t, matcher: compileTerms(t.terms) }));
  const seniority = {
    management: compileTerms(taxonomy.seniority.management),
    senior: compileTerms(taxonomy.seniority.senior),
    junior: compileTerms(taxonomy.seniority.junior),
    mid: compileTerms(taxonomy.seniority.mid),
  };
  const cities = regions.cities.map((c) => ({
    ...c,
    patterns: [...(c.nameIsAmbiguous ? [] : [c.name]), ...c.aliases].map((t) =>
      termToRegExp(t, { inflect: false }),
    ),
  }));
  const regionAliases = (Object.entries(regions.regions) as Array<[RegionId, { aliases: string[] }]>)
    .filter(([id]) => id !== 'remote')
    .map(([id, r]) => ({ id, matcher: compileTerms(r.aliases, { inflect: false }) }));
  const remoteWords = (regions.regions.remote?.aliases ?? []).map(
    (t) => new RegExp(termToRegExp(t, { inflect: false }).source, 'gi'),
  );
  /** Remote/hybrid work is mentioned at least once without a negation right before it. */
  const mentionsRemote = (text: string) =>
    remoteWords.some((re) => [...text.matchAll(re)].some((m) => !NEGATION_BEFORE.test(text.slice(0, m.index))));
  const scoring = scoringConfigOf(profile);
  const skills = scoring.skills.map((s) => ({ label: s.label, matcher: compileTerms(s.terms) }));
  const have = new Set(scoring.have);
  const home = regions.cities.find((c) => c.name === profile.home);
  if (!home) throw new Error(`profile.home "${profile.home}" is not listed in config/regions.yaml`);

  function decideQa(title: string, description: string | undefined, categoryQa: boolean): QaDecision {
    const t = normalizeText(title);
    const excluded = qa.exclude.firstMatch(t);
    if (excluded) return { qa: false, reason: `exclude:${excluded}` };
    const strong = qa.strong.firstMatch(t);
    if (strong) return { qa: true, reason: `strong:${strong}` };
    const weak = qa.weak.firstMatch(t);
    if (!weak) return { qa: false, reason: 'no-title-signal' };
    if (categoryQa) return { qa: true, reason: `weak+category:${weak}` };
    const d = normalizeText(description ?? '');
    const hardware = qa.notSoftware.firstMatch(d);
    if (hardware) return { qa: false, reason: `weak-not-software:${weak}/${hardware}` };
    const context = qa.context.firstMatch(`${t} ${d}`);
    if (context) return { qa: true, reason: `weak+context:${weak}/${context}` };
    return { qa: false, reason: `weak-no-context:${weak}` };
  }

  function isQaCandidate(title: string): boolean {
    const t = normalizeText(title);
    return !qa.exclude.test(t) && (qa.strong.test(t) || qa.weak.test(t));
  }

  function findCities(text: string) {
    const hits: Array<{ city: (typeof cities)[number]; index: number }> = [];
    for (const city of cities) {
      let first = Infinity;
      for (const re of city.patterns) {
        const m = re.exec(text);
        if (m && m.index < first) first = m.index;
      }
      if (first !== Infinity) hits.push({ city, index: first });
    }
    return hits.sort((a, b) => a.index - b.index).map((h) => h.city);
  }

  function regionPhrases(text: string): RegionId[] {
    const found = new Set<RegionId>();
    for (const m of text.matchAll(REGION_PHRASE)) {
      const word = m[1];
      found.add(word ? REGION_WORDS[word]! : 'center');
    }
    return [...found];
  }

  function locate(title: string, description: string, location: string) {
    const head = description.slice(0, 400);
    let matchedCities = location ? findCities(location) : [];
    const regionSet = new Set<RegionId>();
    if (!matchedCities.length && location) {
      for (const r of regionAliases) if (r.matcher.test(location)) regionSet.add(r.id);
    }
    if (!matchedCities.length && !regionSet.size) {
      matchedCities = findCities(title);
      if (!matchedCities.length) regionPhrases(title).forEach((r) => regionSet.add(r));
    }
    if (!matchedCities.length && !regionSet.size) {
      matchedCities = findCities(head);
      if (!matchedCities.length) regionPhrases(head).forEach((r) => regionSet.add(r));
    }
    for (const c of matchedCities) c.regions.forEach((r) => regionSet.add(r));
    if (mentionsRemote(`${title} ${location} ${description}`)) regionSet.add('remote');
    const distances = matchedCities.map((c) => haversineKm(home!.lat, home!.lon, c.lat, c.lon));
    return {
      city: matchedCities[0]?.name,
      regions: [...regionSet],
      distanceKm: distances.length ? Math.round(Math.min(...distances)) : undefined,
    };
  }

  function seniorityOf(title: string, years: number | undefined): Seniority {
    if (seniority.management.test(title)) return 'management';
    if (seniority.senior.test(title)) return 'senior';
    if (seniority.junior.test(title)) return 'junior';
    if (seniority.mid.test(title)) return 'mid';
    if (years === undefined) return 'unknown';
    if (years <= 1) return 'junior';
    if (years >= 5) return 'senior';
    return 'mid';
  }

  function classify(input: ClassifyInput): Classification {
    const title = normalizeText(input.title);
    const description = normalizeText(input.description ?? '');
    const location = normalizeText(input.location ?? '');
    const all = `${title}\n${description}`;

    const jobTags = tags
      .filter((t) => t.matcher.test(t.field === 'title' ? title : all))
      .map((t) => t.label);
    const yearsRequired = parseYearsRequired(all);
    const level = seniorityOf(title, yearsRequired);
    const place = locate(title, description, location);

    // Transparent rule-based score (shared with the dashboard, which can re-score against a CV).
    const requires = skills.filter((s) => s.matcher.test(all)).map((s) => s.label);
    const scored = scoreJob(
      { requires, tags: jobTags, seniority: level, yearsRequired },
      { have, yearsExperience: profile.yearsExperience, bonusTags: profile.bonusTags },
    );

    return {
      tags: jobTags,
      seniority: level,
      yearsRequired,
      ...place,
      ...scored,
      requires,
    };
  }

  return { decideQa, isQaCandidate, classify };
}
