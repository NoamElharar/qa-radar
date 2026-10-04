import {
  compileTerms,
  normalizeText,
  termToRegExp,
  type RegionId,
  type Seniority,
} from '@qa-radar/shared';
import type { AppConfig } from '../config.ts';

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

const EXPERIENCE_WORD = /ניסיון|נסיון|ותק|experience/;
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
  const remote = compileTerms(regions.regions.remote?.aliases ?? [], { inflect: false });
  const skills = profile.skills.map((s) => ({ label: s.label, matcher: compileTerms(s.terms) }));
  const gaps = profile.gaps.map((s) => ({ label: s.label, matcher: compileTerms(s.terms) }));
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
    const context = qa.context.firstMatch(`${t} ${normalizeText(description ?? '')}`);
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
    if (remote.test(`${title} ${location} ${description}`)) regionSet.add('remote');
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

    // Transparent rule-based score: every point can be traced to a ✓/✗ item or a stated rule.
    const matched = skills.filter((s) => s.matcher.test(all)).map((s) => s.label);
    const missing = gaps.filter((g) => g.matcher.test(all)).map((g) => g.label);
    let score = 50;
    score += Math.min(matched.length * 6, 30);
    score -= Math.min(missing.length * 6, 24);
    score += Math.min(
      jobTags.reduce((sum, tag) => sum + (profile.bonusTags[tag] ?? 0), 0),
      15,
    );
    score += { junior: 8, mid: 10, senior: -10, management: -15, unknown: 0 }[level];
    if (yearsRequired !== undefined) {
      const gap = yearsRequired - profile.yearsExperience;
      if (gap <= 1) score += 6;
      else if (yearsRequired >= 5) {
        score -= 15;
        missing.push(`${yearsRequired}+ שנות ניסיון`);
      } else score -= 3 * gap;
    }

    return {
      tags: jobTags,
      seniority: level,
      yearsRequired,
      ...place,
      score: Math.max(0, Math.min(100, Math.round(score))),
      matched,
      missing,
    };
  }

  return { decideQa, isQaCandidate, classify };
}
