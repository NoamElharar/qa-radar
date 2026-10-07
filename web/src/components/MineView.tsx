import { useCallback, useMemo, useRef, useState } from 'react';
import type { Job } from '@qa-radar/shared';
import {
  activeMineFilterCount,
  APPLIED_WINDOW_LABELS,
  applyMineFilters,
  buildItems,
  CHANNEL_SUGGESTIONS,
  COLLAPSED_BY_DEFAULT,
  DEFAULT_MINE_FILTERS,
  groupItems,
  MINE_SORT_LABELS,
  mineFiltersFromParams,
  mineStats,
  writeMineParams,
  type AppliedWindow,
  type MineFilters,
  type MineFlag,
  type MineItem,
  type MineSort,
} from '../lib/mine.ts';
import {
  STATUS_LABELS,
  type JobStatus,
  type PersonalData,
  type StatusEntry,
} from '../lib/storage.ts';
import { SearchIcon } from './icons.tsx';
import { AddApplication } from './mine/AddApplication.tsx';
import { MineRow } from './mine/MineRow.tsx';
import { MineSummary } from './mine/MineSummary.tsx';
import { StatusDot } from './mine/StatusDot.tsx';

const GROUP_PAGE = 25;

interface Props {
  personal: PersonalData;
  jobsById: Map<string, Job>;
  now: Date;
  onUpdate: (jobId: string, patch: Partial<StatusEntry>) => void;
  onAdd: (jobId: string, entry: StatusEntry) => void;
  onTogglePin: (jobId: string) => void;
  onClear: (jobId: string) => void;
  onUnhide: (name: string) => void;
  onHide: (name: string) => void;
  onExport: () => void;
  onImport: (json: string) => void;
}

const FLAG_LABELS: Record<MineFlag, string> = {
  pinned: '📌 נעוצים',
  stale: '⏳ ממתינות 14+ ימים',
  notes: '📝 עם הערות',
  manual: '✍️ ידניות',
};

function useMineFilters() {
  const [filters, setState] = useState<MineFilters>(() =>
    mineFiltersFromParams(new URLSearchParams(window.location.search)),
  );
  const setFilters = useCallback((next: MineFilters) => {
    setState(next);
    const qs = writeMineParams(new URLSearchParams(window.location.search), next).toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, []);
  return [filters, setFilters] as const;
}

/** "המועמדויות שלי": built to stay calm and scannable with hundreds of applications. */
export function MineView({
  personal,
  jobsById,
  now,
  onUpdate,
  onAdd,
  onTogglePin,
  onClear,
  onUnhide,
  onHide,
  onExport,
  onImport,
}: Props) {
  const [filters, setFilters] = useMineFilters();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<JobStatus>>(COLLAPSED_BY_DEFAULT);
  const [shown, setShown] = useState<Partial<Record<JobStatus, number>>>({});
  const [newHidden, setNewHidden] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const items = useMemo(
    () => buildItems(personal.statuses, jobsById),
    [personal.statuses, jobsById],
  );
  const stats = useMemo(() => mineStats(items, now), [items, now]);
  const visible = useMemo(() => applyMineFilters(items, filters, now), [items, filters, now]);
  const { pinned, groups } = useMemo(() => groupItems(visible), [visible]);
  const activeCount = activeMineFilterCount(filters);

  const set = (patch: Partial<MineFilters>) => setFilters({ ...filters, ...patch });
  const toggleIn = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const toggleExpand = useCallback(
    (id: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const isCollapsed = (s: JobStatus) =>
    collapsed.has(s) && !filters.statuses.includes(s) && !filters.q;

  const renderRows = (list: MineItem[], showStatus = false) => (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {list.map((item) => (
        <MineRow
          key={item.id}
          item={item}
          now={now}
          expanded={expanded.has(item.id)}
          onToggleExpand={toggleExpand}
          onTogglePin={onTogglePin}
          onUpdate={onUpdate}
          onRemove={onClear}
          showStatus={showStatus}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <AddApplication onAdd={onAdd} />
      <datalist id="qa-radar-channels">
        {CHANNEL_SUGGESTIONS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {!items.length ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500 dark:border-slate-700">
          עוד לא סימנת משרות. השתמש/י בכוכב או בתפריט הסטטוס בכרטיס משרה — או הוסף/י ידנית מועמדות
          שהגשת במקום אחר.
        </p>
      ) : (
        <>
          <MineSummary
            stats={stats}
            total={items.length}
            selected={filters.statuses}
            staleActive={filters.flags.includes('stale')}
            onToggleStatus={(s) => set({ statuses: toggleIn(filters.statuses, s) })}
            onClearStatuses={() => set({ statuses: [] })}
            onToggleStale={() => set({ flags: toggleIn(filters.flags, 'stale') })}
          />

          {/* Filters for "שלי" */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="relative flex-1">
                <span className="sr-only">חיפוש במועמדויות (כותרת, חברה, הערות)</span>
                <SearchIcon className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={filters.q}
                  onChange={(e) => set({ q: e.target.value })}
                  placeholder="חיפוש…"
                  title="חיפוש בכותרת, בשם החברה ובהערות"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 ps-9 pe-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <label>
                <span className="sr-only">מיון</span>
                <select
                  value={filters.sort}
                  onChange={(e) => set({ sort: e.target.value as MineSort })}
                  className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {(Object.keys(MINE_SORT_LABELS) as MineSort[]).map((s) => (
                    <option key={s} value={s}>
                      {MINE_SORT_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4">
              {(Object.keys(FLAG_LABELS) as MineFlag[]).map((flag) => {
                const active = filters.flags.includes(flag);
                return (
                  <button
                    key={flag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set({ flags: toggleIn(filters.flags, flag) })}
                    className={`min-h-9 shrink-0 rounded-full border px-3 text-xs ${
                      active
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                    }`}
                  >
                    {FLAG_LABELS[flag]}
                  </button>
                );
              })}
              <select
                value={filters.applied}
                onChange={(e) => set({ applied: e.target.value as AppliedWindow })}
                aria-label="תאריך הגשה"
                className={`min-h-9 shrink-0 rounded-full border px-2 text-xs ${
                  filters.applied !== 'any'
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                }`}
              >
                {(Object.keys(APPLIED_WINDOW_LABELS) as AppliedWindow[]).map((w) => (
                  <option key={w} value={w}>
                    {APPLIED_WINDOW_LABELS[w]}
                  </option>
                ))}
              </select>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters({ ...DEFAULT_MINE_FILTERS, sort: filters.sort })}
                  className="min-h-9 shrink-0 px-2 text-xs text-brand-700 underline dark:text-brand-500"
                >
                  נקה סינון ({activeCount})
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500" aria-live="polite">
              {visible.length === items.length
                ? `${items.length} משרות`
                : `מציג ${visible.length} מתוך ${items.length}`}
            </p>
          </div>

          {!visible.length && (
            <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500 dark:border-slate-700">
              אין מועמדויות שמתאימות לסינון.{' '}
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_MINE_FILTERS)}
                className="text-brand-700 underline dark:text-brand-500"
              >
                נקה סינון
              </button>
            </p>
          )}

          {pinned.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white dark:border-brand-800 dark:bg-slate-900">
              <h3 className="border-b border-brand-100 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-900 dark:border-brand-800 dark:bg-brand-900/40 dark:text-brand-100">
                📌 נעוצים · {pinned.length}
              </h3>
              {renderRows(pinned, true)}
            </section>
          )}

          {groups.map(({ status, items: groupList }) => {
            const closed = isCollapsed(status);
            const limit = shown[status] ?? GROUP_PAGE;
            return (
              <section
                key={status}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <h3>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (closed) next.delete(status);
                        else next.add(status);
                        return next;
                      })
                    }
                    aria-expanded={!closed}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-semibold"
                  >
                    <StatusDot status={status} />
                    {STATUS_LABELS[status]}
                    <span className="font-normal text-slate-500 tabular-nums">
                      {groupList.length}
                    </span>
                    <span className="ms-auto text-slate-400" aria-hidden="true">
                      {closed ? '▾' : '▴'}
                    </span>
                  </button>
                </h3>
                {!closed && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {renderRows(groupList.slice(0, limit))}
                    {groupList.length > limit && (
                      <button
                        type="button"
                        onClick={() =>
                          setShown((prev) => ({ ...prev, [status]: limit + GROUP_PAGE }))
                        }
                        className="w-full border-t border-slate-100 py-2.5 text-sm text-brand-700 dark:border-slate-800 dark:text-brand-500"
                      >
                        הצג עוד {Math.min(GROUP_PAGE, groupList.length - limit)} (נותרו{' '}
                        {groupList.length - limit})
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}

      <details className="group rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
          ⚙️ חברות מוסתרות וגיבוי
          <span className="ms-2 text-xs font-normal text-slate-500">
            {personal.hiddenCompanies.length ? `${personal.hiddenCompanies.length} מוסתרות` : ''}
          </span>
        </summary>
        <div className="space-y-5 border-t border-slate-100 px-4 py-4 dark:border-slate-800">
          <div>
            <h4 className="text-sm font-semibold">חברות מוסתרות</h4>
            <p className="mb-3 text-xs text-slate-500">
              משרות שמזכירות את השמות האלה לא יוצגו. נשמר רק בדפדפן הזה.
            </p>
            <div className="flex flex-wrap gap-2">
              {personal.hiddenCompanies.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onUnhide(name)}
                  className="min-h-9 rounded-full bg-slate-100 px-3 text-sm dark:bg-slate-800"
                  aria-label={`הצג שוב את ${name}`}
                >
                  <bdi>{name}</bdi> ✕
                </button>
              ))}
              {!personal.hiddenCompanies.length && (
                <span className="text-sm text-slate-400">אין</span>
              )}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newHidden.trim()) onHide(newHidden.trim());
                setNewHidden('');
              }}
            >
              <input
                value={newHidden}
                onChange={(e) => setNewHidden(e.target.value)}
                placeholder="שם חברה להסתרה"
                className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="submit"
                className="min-h-11 rounded-lg bg-slate-800 px-3 text-sm text-white dark:bg-slate-200 dark:text-slate-900"
              >
                הוסף
              </button>
            </form>
          </div>
          <div>
            <h4 className="text-sm font-semibold">גיבוי</h4>
            <p className="mb-3 text-xs text-slate-500">
              הסטטוסים, ההערות והנעיצות נשמרים רק בדפדפן הזה. כדאי לייצא גיבוי מדי פעם (וכדי להעביר
              לטלפון אחר).
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onExport}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700"
              >
                ייצוא JSON
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700"
              >
                ייבוא JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) onImport(await file.text());
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
