import { useCallback, useEffect, useState } from 'react';
import { defaultFilters, filtersFromParams, filtersToParams, type Filters, type View } from './filters.ts';

function urlFor(f: Filters): string {
  const qs = filtersToParams(f).toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ''}`;
}

/** Filter state mirrored in the query string, so any view can be bookmarked or shared. */
export function useUrlFilters() {
  const [filters, setState] = useState<Filters>(() => filtersFromParams(new URLSearchParams(window.location.search)));

  useEffect(() => {
    const onPop = () => setState(filtersFromParams(new URLSearchParams(window.location.search)));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** Tweaks within a view replace the history entry (no back-button spam). */
  const setFilters = useCallback((next: Filters) => {
    setState(next);
    window.history.replaceState(null, '', urlFor(next));
  }, []);

  /** Switching views pushes a history entry so "back" returns to the previous view. */
  const setView = useCallback((view: View) => {
    const next = defaultFilters(view);
    setState(next);
    window.history.pushState(null, '', urlFor(next));
    window.scrollTo({ top: 0 });
  }, []);

  const resetFilters = useCallback(() => setFilters(defaultFilters(filters.view)), [filters.view, setFilters]);

  return { filters, setFilters, setView, resetFilters };
}
