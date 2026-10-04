import {
  badgeFor,
  matchesQuery,
  normalizeText,
  REGION_IDS,
  type Job,
  type RegionId,
  type Seniority,
  type SourceType,
} from '@qa-radar/shared';
import { HANDLED_STATUSES, type StatusEntry } from './storage.ts';

export type View = 'new' | 'all' | 'mine' | 'sources';
export type TimeWindow = '24h' | '3d' | '7d' | '30d' | 'any';
export type SortOrder = 'new' | 'score';

export interface Filters {
  view: View;
  q: string;
  regions: RegionId[];
  /** Also show jobs whose location is unknown when a region filter is active. */
  includeUnknown: boolean;
  cities: string[];
  maxKm?: number;
  tags: string[];
  seniority: Seniority[];
  sourceTypes: SourceType[];
  sources: string[];
  time: TimeWindow;
  minScore: number;
  hideHandled: boolean;
  showClosed: boolean;
  sort: SortOrder;
}

export const TIME_LABELS: Record<TimeWindow, string> = {
  '24h': '24 שעות',
  '3d': '3 ימים',
  '7d': 'שבוע',
  '30d': 'חודש',
  any: 'הכל',
};
const TIME_MS: Record<TimeWindow, number> = {
  '24h': 864e5,
  '3d': 3 * 864e5,
  '7d': 7 * 864e5,
  '30d': 30 * 864e5,
  any: Infinity,
};

/** Defaults per view. Only values that differ from these are written to the URL. */
export function defaultFilters(view: View = 'new'): Filters {
  return {
    view,
    q: '',
    regions: ['center', 'shfela'],
    includeUnknown: true,
    cities: [],
    maxKm: undefined,
    tags: [],
    seniority: [],
    sourceTypes: [],
    sources: [],
    time: view === 'new' ? '24h' : '30d',
    minScore: 0,
    hideHandled: view !== 'mine',
    showClosed: false,
    sort: 'new',
  };
}

const list = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const TIME_VALUES = Object.keys(TIME_LABELS) as TimeWindow[];

export function filtersFromParams(params: URLSearchParams): Filters {
  const viewParam = params.get('view');
  const view: View = viewParam === 'all' || viewParam === 'mine' || viewParam === 'sources' ? viewParam : 'new';
  const d = defaultFilters(view);
  const time = params.get('t') as TimeWindow | null;
  const km = Number(params.get('km'));
  return {
    view,
    q: params.get('q') ?? d.q,
    regions: params.has('r') ? (list(params.get('r')).filter((r) => REGION_IDS.includes(r as RegionId)) as RegionId[]) : d.regions,
    includeUnknown: params.has('unk') ? params.get('unk') === '1' : d.includeUnknown,
    cities: list(params.get('city')),
    maxKm: Number.isFinite(km) && km > 0 ? km : undefined,
    tags: list(params.get('tags')),
    seniority: list(params.get('sen')) as Seniority[],
    sourceTypes: list(params.get('st')) as SourceType[],
    sources: list(params.get('src')),
    time: time && TIME_VALUES.includes(time) ? time : d.time,
    minScore: Number(params.get('min')) || 0,
    hideHandled: params.has('hide') ? params.get('hide') === '1' : d.hideHandled,
    showClosed: params.get('closed') === '1',
    sort: params.get('sort') === 'score' ? 'score' : 'new',
  };
}

export function filtersToParams(f: Filters): URLSearchParams {
  const d = defaultFilters(f.view);
  const p = new URLSearchParams();
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
  if (f.view !== 'new') p.set('view', f.view);
  if (f.q) p.set('q', f.q);
  if (!same(f.regions, d.regions)) p.set('r', f.regions.join(','));
  if (f.includeUnknown !== d.includeUnknown) p.set('unk', f.includeUnknown ? '1' : '0');
  if (f.cities.length) p.set('city', f.cities.join(','));
  if (f.maxKm) p.set('km', String(f.maxKm));
  if (f.tags.length) p.set('tags', f.tags.join(','));
  if (f.seniority.length) p.set('sen', f.seniority.join(','));
  if (f.sourceTypes.length) p.set('st', f.sourceTypes.join(','));
  if (f.sources.length) p.set('src', f.sources.join(','));
  if (f.time !== d.time) p.set('t', f.time);
  if (f.minScore) p.set('min', String(f.minScore));
  if (f.hideHandled !== d.hideHandled) p.set('hide', f.hideHandled ? '1' : '0');
  if (f.showClosed) p.set('closed', '1');
  if (f.sort !== 'new') p.set('sort', f.sort);
  return p;
}

export interface FilterContext {
  now: Date;
  statuses: Record<string, StatusEntry>;
  hiddenCompanies: string[];
}

export function isHiddenCompany(job: Job, hidden: string[]): boolean {
  if (!hidden.length) return false;
  const hay = normalizeText([job.company, job.agency, job.endClient, job.title].filter(Boolean).join(' '));
  return hidden.some((name) => {
    const n = normalizeText(name);
    return n.length > 1 && hay.includes(n);
  });
}

/** Search text for a job: title, company, agency, client, city, tags, snippet. */
function haystack(job: Job): string {
  return [job.title, job.company, job.agency, job.endClient, job.city, job.locationText, job.tags.join(' '), job.snippet]
    .filter(Boolean)
    .join(' ');
}

export function applyFilters(jobs: Job[], f: Filters, ctx: FilterContext): Job[] {
  const now = ctx.now.getTime();
  const result = jobs.filter((job) => {
    if (isHiddenCompany(job, ctx.hiddenCompanies)) return false;
    if (job.state === 'closed' && !f.showClosed) return false;
    if (f.view === 'new') {
      // "חדש היום": jobs that are genuinely new or came back — never the silent baseline.
      const badge = badgeFor(job, ctx.now);
      if (badge !== 'new' && badge !== 'back') return false;
    } else if (f.time !== 'any' && now - Date.parse(job.firstSeenAt) > TIME_MS[f.time]) {
      return false;
    }
    const status = ctx.statuses[job.id]?.status;
    if (f.hideHandled && status && HANDLED_STATUSES.has(status)) return false;
    if (f.regions.length) {
      const known = job.regions.filter((r) => r !== 'remote');
      const inRegion = job.regions.some((r) => f.regions.includes(r));
      if (!inRegion && !(f.includeUnknown && known.length === 0)) return false;
    }
    if (f.cities.length && !(job.city && f.cities.includes(job.city))) return false;
    if (f.maxKm && (job.distanceKm === undefined || job.distanceKm > f.maxKm)) {
      if (!(f.includeUnknown && job.distanceKm === undefined)) return false;
    }
    if (f.tags.length && !f.tags.some((t) => job.tags.includes(t))) return false;
    if (f.seniority.length && !f.seniority.includes(job.seniority)) return false;
    if (f.sources.length && !f.sources.includes(job.sourceId)) return false;
    if (f.minScore && job.score < f.minScore) return false;
    if (f.q && !matchesQuery(haystack(job), f.q)) return false;
    return true;
  });

  const newest = (j: Job) => Date.parse(j.reappearedAt && j.reappearedAt > j.firstSeenAt ? j.reappearedAt : j.firstSeenAt);
  return result.sort((a, b) =>
    f.sort === 'score' ? b.score - a.score || newest(b) - newest(a) : newest(b) - newest(a) || b.score - a.score,
  );
}

/** Source-type filter needs the source registry (job → source type), so it is applied separately. */
export function applySourceTypeFilter(jobs: Job[], f: Filters, typeOf: (sourceId: string) => SourceType | undefined): Job[] {
  if (!f.sourceTypes.length) return jobs;
  return jobs.filter((j) => {
    const t = typeOf(j.sourceId);
    return t !== undefined && f.sourceTypes.includes(t);
  });
}

/** Number of active filters (for the "סינון (3)" button), excluding view defaults. */
export function activeFilterCount(f: Filters): number {
  return [...filtersToParams(f).keys()].filter((k) => k !== 'view' && k !== 'q' && k !== 'sort').length;
}
