import { REGION_LABELS } from '@qa-radar/shared';
import { activeFilterCount, TIME_LABELS, type Filters } from '../lib/filters.ts';
import { FilterIcon, SearchIcon } from './icons.tsx';

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
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={f.q}
            onChange={(e) => onChange({ ...f, q: e.target.value })}
            placeholder="חיפוש: API, מובייל, SQLink…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 ps-9 pe-3 text-sm shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <button
          type="button"
          onClick={onOpenFilters}
          className="relative inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium shadow-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <FilterIcon /> סינון
          {count > 0 && (
            <span className="absolute -top-1.5 -end-1.5 grid size-5 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{count}</span>
          )}
        </button>
      </div>
      <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4">
        <button
          type="button"
          onClick={() => onChange({ ...f, sort: f.sort === 'new' ? 'score' : 'new' })}
          className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-white dark:bg-slate-200 dark:text-slate-900"
          aria-label="שינוי מיון"
        >
          מיון: {f.sort === 'new' ? 'חדש ביותר' : 'התאמה הכי טובה'} ⇅
        </button>
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.clear}
            className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs text-brand-800 dark:border-brand-800 dark:bg-brand-900/50 dark:text-brand-100"
            aria-label={`הסר סינון ${c.label}`}
          >
            {c.label} ✕
          </button>
        ))}
      </div>
    </div>
  );
}
