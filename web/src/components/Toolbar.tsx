import { REGION_LABELS } from '@qa-radar/shared';
import { activeFilterCount, TIME_LABELS, type Filters } from '../lib/filters.ts';
import { CloseIcon, FilterIcon, SearchIcon, SortIcon } from './icons.tsx';

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  onOpenFilters: () => void;
}

/** Search box, filter button, sort toggle and a row of removable chips for the active filters. */
export function Toolbar({ filters: f, onChange, onOpenFilters }: Props) {
  const count = activeFilterCount(f);
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (f.regions.length) chips.push({ key: 'r', label: f.regions.map((r) => REGION_LABELS[r]).join(' + '), clear: () => onChange({ ...f, regions: [] }) });
  if (f.view !== 'new') chips.push({ key: 't', label: TIME_LABELS[f.time], clear: () => onChange({ ...f, time: 'any' }) });
  if (f.maxKm) chips.push({ key: 'km', label: `עד ${f.maxKm} ק״מ`, clear: () => onChange({ ...f, maxKm: undefined }) });
  for (const t of f.tags) chips.push({ key: `tag-${t}`, label: t, clear: () => onChange({ ...f, tags: f.tags.filter((x) => x !== t) }) });
  for (const c of f.cities) chips.push({ key: `city-${c}`, label: c, clear: () => onChange({ ...f, cities: f.cities.filter((x) => x !== c) }) });
  if (f.minScore) chips.push({ key: 'min', label: `ציון ${f.minScore}+`, clear: () => onChange({ ...f, minScore: 0 }) });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <span className="sr-only">חיפוש</span>
          <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={f.q}
            onChange={(e) => onChange({ ...f, q: e.target.value })}
            placeholder="חיפוש: API, מובייל, NESS…"
            className="min-h-11 w-full rounded-2xl border border-line bg-surface py-2.5 ps-10 pe-3 text-sm shadow-card transition-shadow duration-150 focus:border-brand-600 dark:focus:border-brand-500"
          />
        </label>
        <button
          type="button"
          onClick={onOpenFilters}
          className="relative inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm font-medium shadow-card transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <FilterIcon /> סינון
          {count > 0 && (
            <>
              <span
                aria-hidden="true"
                className="absolute -top-1.5 -end-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-700 px-1 text-xs font-bold text-white tabular-nums ring-2 ring-[#edf2f7] dark:ring-[#0b1220]"
              >
                {count}
              </span>
              <span className="sr-only">, {count === 1 ? 'סינון אחד פעיל' : `${count} סינונים פעילים`}</span>
            </>
          )}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...f, sort: f.sort === 'new' ? 'score' : 'new' })}
          // The visible text is the name, so screen readers and voice control hear the current sort.
          className="tap-44 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-slate-700 shadow-card transition-colors duration-150 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <SortIcon className="text-muted" />
          מיון: {f.sort === 'new' ? 'חדש ביותר' : 'התאמה הכי טובה'}
        </button>
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.clear}
            className="tap-44 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 ps-3 pe-2 text-xs font-medium text-brand-800 transition-colors duration-150 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/50 dark:text-brand-100 dark:hover:bg-brand-900"
            aria-label={`הסר סינון ${c.label}`}
          >
            {c.label} <CloseIcon className="text-sm" />
          </button>
        ))}
      </div>
    </div>
  );
}
