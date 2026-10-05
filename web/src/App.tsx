import { useCallback, useEffect, useMemo, useState } from 'react';
import { isNewSince, type Job, type SourceType } from '@qa-radar/shared';
import { BottomNav, Header } from './components/Chrome.tsx';
import { FilterSheet, type FilterOptions } from './components/FilterSheet.tsx';
import { JobCard } from './components/JobCard.tsx';
import { MineView } from './components/MineView.tsx';
import { QuickLaunch } from './components/QuickLaunch.tsx';
import { SourcesView } from './components/SourcesView.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { useRadarData } from './lib/useRadarData.ts';
import { applyFilters, applySourceTypeFilter, defaultFilters } from './lib/filters.ts';
import {
  exportPersonal,
  importPersonal,
  loadPersonal,
  loadTheme,
  saveLastVisit,
  savePersonal,
  saveTheme,
  type JobStatus,
  type PersonalData,
  type StatusEntry,
  type ThemePreference,
} from './lib/storage.ts';
import { relativeTime } from './lib/time.ts';
import { useUrlFilters } from './lib/useUrlFilters.ts';

const PAGE_SIZE = 50;

function useNow(intervalMs = 60000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function useTheme(): [ThemePreference, (t: ThemePreference) => void] {
  const [theme, setTheme] = useState<ThemePreference>(loadTheme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    saveTheme(theme);
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return [theme, setTheme];
}

export function App() {
  const now = useNow();
  const [theme, setTheme] = useTheme();
  const { filters, setFilters, setView, resetFilters } = useUrlFilters();
  const { data, error: loadError, refreshing, notice, refresh } = useRadarData();
  const [personal, setPersonal] = useState<PersonalData>(loadPersonal);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  // The previous visit is frozen for this session so the "new since" highlight doesn't vanish on re-render.
  const [previousVisit] = useState(() => (personal.lastVisitAt ? new Date(personal.lastVisitAt) : undefined));

  useEffect(() => {
    const remember = () => document.visibilityState === 'hidden' && saveLastVisit(new Date().toISOString());
    document.addEventListener('visibilitychange', remember);
    window.addEventListener('pagehide', () => saveLastVisit(new Date().toISOString()));
    return () => document.removeEventListener('visibilitychange', remember);
  }, []);

  useEffect(() => setLimit(PAGE_SIZE), [filters]);

  const updatePersonal = useCallback((next: PersonalData) => {
    setPersonal(next);
    savePersonal(next);
  }, []);

  const jobs = useMemo(() => data?.jobs.jobs ?? [], [data]);
  const sources = useMemo(() => data?.health.sources ?? [], [data]);
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const typeOf = useCallback((id: string): SourceType | undefined => sourceById.get(id)?.type, [sourceById]);

  const ctx = useMemo(() => ({ now, statuses: personal.statuses, hiddenCompanies: personal.hiddenCompanies }), [now, personal]);
  const visible = useMemo(
    () => applySourceTypeFilter(applyFilters(jobs, filters, ctx), filters, typeOf),
    [jobs, filters, ctx, typeOf],
  );
  const newTodayCount = useMemo(
    () => applySourceTypeFilter(applyFilters(jobs, defaultFilters('new'), ctx), defaultFilters('new'), typeOf).length,
    [jobs, ctx, typeOf],
  );
  const newSinceVisit = useMemo(
    () => (previousVisit ? visible.filter((j) => isNewSince(j, previousVisit)).length : 0),
    [visible, previousVisit],
  );

  const failing = sources.filter((s) => s.status === 'error' || s.status === 'suspect');
  const linkOut = sources.filter((s) => s.status === 'link-out');
  const baselinePending = jobs.length > 0 && jobs.every((j) => j.baseline) && filters.view === 'new';

  const filterOptions: FilterOptions = useMemo(() => {
    const count = <T extends string>(values: T[]) => {
      const m = new Map<T, number>();
      values.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
    };
    const active = jobs.filter((j) => j.state === 'active');
    return {
      cities: count(active.flatMap((j) => (j.city ? [j.city] : []))).slice(0, 30),
      tags: count(active.flatMap((j) => j.tags)),
      sources: [...new Set(active.map((j) => j.sourceId))]
        .map((id) => ({ id, name: sourceById.get(id)?.name ?? id }))
        .sort((a, b) => a.name.localeCompare(b.name, 'he')),
    };
  }, [jobs, sourceById]);

  const setStatus = useCallback(
    (job: Job, status: JobStatus | undefined) => {
      const statuses = { ...personal.statuses };
      if (!status) delete statuses[job.id];
      else {
        const prev = statuses[job.id];
        statuses[job.id] = {
          ...prev,
          status,
          updatedAt: new Date().toISOString(),
          appliedAt: status === 'applied' && !prev?.appliedAt ? new Date().toISOString() : prev?.appliedAt,
          snapshot: { title: job.title, company: job.company ?? job.agency, url: job.url },
        };
      }
      updatePersonal({ ...personal, statuses });
    },
    [personal, updatePersonal],
  );

  const onOpen = useCallback(
    (job: Job) => {
      if (!personal.statuses[job.id]) setStatus(job, 'viewed');
    },
    [personal.statuses, setStatus],
  );

  const updateEntry = (id: string, patch: Partial<StatusEntry>) => {
    const prev = personal.statuses[id];
    if (!prev) return;
    updatePersonal({ ...personal, statuses: { ...personal.statuses, [id]: { ...prev, ...patch, updatedAt: new Date().toISOString() } } });
  };
  /** Pinning is about display order only, so it doesn't count as an update (keeps "waiting" timers honest). */
  const togglePin = (id: string) => {
    const prev = personal.statuses[id];
    if (!prev) return;
    const next: StatusEntry = prev.pinned
      ? { ...prev, pinned: undefined, pinnedAt: undefined }
      : { ...prev, pinned: true, pinnedAt: new Date().toISOString() };
    updatePersonal({ ...personal, statuses: { ...personal.statuses, [id]: next } });
  };
  const clearEntry = (id: string) => {
    const statuses = { ...personal.statuses };
    delete statuses[id];
    updatePersonal({ ...personal, statuses });
  };
  const hideCompany = (name: string) =>
    updatePersonal({ ...personal, hiddenCompanies: [...new Set([...personal.hiddenCompanies, name])] });
  const unhideCompany = (name: string) =>
    updatePersonal({ ...personal, hiddenCompanies: personal.hiddenCompanies.filter((n) => n !== name) });
  const markChecked = (sourceId: string) =>
    updatePersonal({ ...personal, quickChecks: { ...personal.quickChecks, [sourceId]: new Date().toISOString() } });

  const doExport = () => {
    const blob = new Blob([exportPersonal(personal)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qa-radar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const doImport = (json: string) => {
    try {
      updatePersonal(importPersonal(personal, json));
      window.alert('הגיבוי יובא בהצלחה');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'ייבוא נכשל');
    }
  };

  const isJobsView = filters.view === 'new' || filters.view === 'all';

  return (
    <>
      <Header
        updatedAt={data?.health.generatedAt}
        now={now}
        theme={theme}
        onTheme={setTheme}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      />
      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-4 pb-28">
        {loadError && (
          <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800 dark:bg-rose-950 dark:text-rose-200">
            לא הצלחתי לטעון את הנתונים ({loadError}). אם זו הפעלה מקומית — הריצו קודם <code dir="ltr">npm run collect</code>.
          </p>
        )}
        {!data && !loadError && <p className="py-10 text-center text-slate-500">טוען…</p>}

        {data && failing.length > 0 && filters.view !== 'sources' && (
          <button
            type="button"
            onClick={() => setView('sources')}
            className="w-full rounded-xl border border-amber-300 bg-amber-50 p-3 text-start text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
          >
            ⚠️ {failing.length === 1 ? 'מקור אחד לא נטען' : `${failing.length} מקורות לא נטענו`} בריצה האחרונה ({failing.map((s) => s.name).join(', ')}) — ייתכן שחסרות משרות. לפרטים ←
          </button>
        )}

        {data && isJobsView && (
          <>
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-bold">{filters.view === 'new' ? 'חדש היום' : 'כל המשרות'}</h2>
              <span className="text-sm text-slate-500">{visible.length} משרות</span>
            </div>
            {previousVisit && newSinceVisit > 0 && (
              <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                🔴 {newSinceVisit} {newSinceVisit === 1 ? 'משרה חדשה' : 'משרות חדשות'} מאז הביקור הקודם ({relativeTime(previousVisit.toISOString(), now)})
              </p>
            )}
            <Toolbar filters={filters} onChange={setFilters} onOpenFilters={() => setFiltersOpen(true)} />

            {baselinePending && (
              <p className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900 dark:border-brand-800 dark:bg-brand-900/40 dark:text-brand-100">
                זו הריצה הראשונה — כל המשרות הקיימות נשמרו כ"בסיס" ולא מסומנות כחדשות. משרות שיופיעו מעכשיו יוצגו כאן. בינתיים אפשר לראות את כל {jobs.length} המשרות בלשונית "הכל".
              </p>
            )}

            <ul className="space-y-3">
              {visible.slice(0, limit).map((job) => (
                <li key={job.id}>
                  <JobCard
                    job={job}
                    sourceName={sourceById.get(job.sourceId)?.name ?? job.sourceId}
                    status={personal.statuses[job.id]}
                    highlight={!!previousVisit && isNewSince(job, previousVisit)}
                    now={now}
                    onStatus={setStatus}
                    onOpen={onOpen}
                    onHideCompany={hideCompany}
                  />
                </li>
              ))}
            </ul>
            {visible.length > limit && (
              <button type="button" onClick={() => setLimit((l) => l + PAGE_SIZE)} className="w-full rounded-xl border border-slate-300 py-3 text-sm dark:border-slate-700">
                הצג עוד {Math.min(PAGE_SIZE, visible.length - limit)} (מתוך {visible.length - limit} נוספות)
              </button>
            )}
            {!visible.length && !baselinePending && (
              <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500 dark:border-slate-700">
                {filters.view === 'new' ? 'אין משרות חדשות ב-24 השעות האחרונות לפי הסינון.' : 'אין משרות שמתאימות לסינון.'}{' '}
                <button type="button" onClick={resetFilters} className="text-brand-700 underline dark:text-brand-500">
                  איפוס סינון
                </button>
              </p>
            )}

            {linkOut.length > 0 && <QuickLaunch sources={linkOut} checks={personal.quickChecks} now={now} onChecked={markChecked} />}
          </>
        )}

        {data && filters.view === 'mine' && (
          <>
            <h2 className="text-xl font-bold">המועמדויות שלי</h2>
            <MineView
              personal={personal}
              jobsById={jobsById}
              now={now}
              onUpdate={updateEntry}
              onTogglePin={togglePin}
              onClear={clearEntry}
              onHide={hideCompany}
              onUnhide={unhideCompany}
              onExport={doExport}
              onImport={doImport}
            />
          </>
        )}

        {data && filters.view === 'sources' && (
          <>
            <h2 className="text-xl font-bold">מקורות</h2>
            <SourcesView sources={sources} generatedAt={data.health.generatedAt} now={now} />
          </>
        )}
      </main>

      <FilterSheet
        open={filtersOpen}
        filters={filters}
        options={filterOptions}
        resultCount={visible.length}
        onChange={setFilters}
        onReset={resetFilters}
        onClose={() => setFiltersOpen(false)}
      />
      {notice && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
        >
          {notice}
        </div>
      )}
      <BottomNav
        view={filters.view}
        counts={{
          new: newTodayCount,
          // "נצפה" is set automatically when a posting is opened — not something to act on, so not counted.
          mine: Object.values(personal.statuses).filter((e) => e.status !== 'viewed').length || undefined,
          sources: failing.length || undefined,
        }}
        onView={setView}
      />
    </>
  );
}
