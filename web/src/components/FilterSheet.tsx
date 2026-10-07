import { useEffect, useRef, type ReactNode } from 'react';
import {
  REGION_IDS,
  REGION_LABELS,
  SENIORITY_LABELS,
  SOURCE_TYPE_LABELS,
  type RegionId,
  type Seniority,
  type SourceType,
} from '@qa-radar/shared';
import { TIME_LABELS, type Filters, type TimeWindow } from '../lib/filters.ts';
import { CloseIcon } from './icons.tsx';

export interface FilterOptions {
  cities: string[];
  tags: string[];
  sources: Array<{ id: string; name: string }>;
}

interface Props {
  open: boolean;
  filters: Filters;
  options: FilterOptions;
  resultCount: number;
  onChange: (f: Filters) => void;
  onReset: () => void;
  onClose: () => void;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-10 rounded-full border px-3 text-sm transition ${
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-slate-100 py-4 dark:border-slate-800">
      <legend className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</legend>
      {children}
    </fieldset>
  );
}

const SENIORITY_VALUES: Seniority[] = ['junior', 'mid', 'senior', 'management', 'unknown'];
const SOURCE_TYPES: SourceType[] = ['direct', 'agency', 'board'];
const KM_OPTIONS = [10, 20, 30, 50, 80];

export function FilterSheet({ open, filters: f, options, resultCount, onChange, onReset, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      aria-label="סינון משרות"
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-none rounded-t-3xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 md:ms-auto md:mt-0 md:h-dvh md:max-h-none md:w-[26rem] md:rounded-none dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold">סינון</h2>
        <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="סגור">
          <CloseIcon />
        </button>
      </div>

      <div className="px-5 pb-28">
        <Section title="אזור">
          <div className="flex flex-wrap gap-2">
            {REGION_IDS.map((r: RegionId) => (
              <Chip key={r} active={f.regions.includes(r)} onClick={() => set({ regions: toggle(f.regions, r) })}>
                {REGION_LABELS[r]}
              </Chip>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={f.includeUnknown} onChange={(e) => set({ includeUnknown: e.target.checked })} className="size-4 accent-brand-600" />
            כולל משרות בלי מיקום ידוע
          </label>
        </Section>

        {options.cities.length > 0 && (
          <Section title="עיר">
            <div className="flex flex-wrap gap-2">
              {options.cities.map((c) => (
                <Chip key={c} active={f.cities.includes(c)} onClick={() => set({ cities: toggle(f.cities, c) })}>
                  {c}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        <Section title="מרחק מקריית עקרון">
          <div className="flex flex-wrap gap-2">
            <Chip active={!f.maxKm} onClick={() => set({ maxKm: undefined })}>
              ללא הגבלה
            </Chip>
            {KM_OPTIONS.map((km) => (
              <Chip key={km} active={f.maxKm === km} onClick={() => set({ maxKm: km })}>
                עד {km} ק״מ
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="נושא">
          <div className="flex flex-wrap gap-2">
            {options.tags.map((t) => (
              <Chip key={t} active={f.tags.includes(t)} onClick={() => set({ tags: toggle(f.tags, t) })}>
                {t}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="בכירות">
          <div className="flex flex-wrap gap-2">
            {SENIORITY_VALUES.map((s) => (
              <Chip key={s} active={f.seniority.includes(s)} onClick={() => set({ seniority: toggle(f.seniority, s) })}>
                {SENIORITY_LABELS[s]}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="סוג מקור">
          <div className="flex flex-wrap gap-2">
            {SOURCE_TYPES.map((t) => (
              <Chip key={t} active={f.sourceTypes.includes(t)} onClick={() => set({ sourceTypes: toggle(f.sourceTypes, t) })}>
                {SOURCE_TYPE_LABELS[t]}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="מקור ספציפי">
          <div className="flex flex-wrap gap-2">
            {options.sources.map((s) => (
              <Chip key={s.id} active={f.sources.includes(s.id)} onClick={() => set({ sources: toggle(f.sources, s.id) })}>
                {s.name}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title={f.view === 'new' ? 'זמן (בתצוגת "חדש" — 24 שעות אחרונות)' : 'נראתה לראשונה'}>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TIME_LABELS) as TimeWindow[]).map((t) => (
              <Chip key={t} active={f.time === t} onClick={() => f.view !== 'new' && set({ time: t })}>
                {TIME_LABELS[t]}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title={`ציון התאמה מינימלי: ${f.minScore}`}>
          <input
            type="range"
            min={0}
            max={90}
            step={10}
            value={f.minScore}
            onChange={(e) => set({ minScore: Number(e.target.value) })}
            className="h-11 w-full accent-brand-600"
            aria-label="ציון התאמה מינימלי"
          />
        </Section>

        <Section title="תצוגה">
          <label className="flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" checked={f.hideHandled} onChange={(e) => set({ hideHandled: e.target.checked })} className="size-4 accent-brand-600" />
            הסתר משרות שטיפלתי בהן (הגשתי / ראיון / נדחה / לא רלוונטי)
          </label>
          <label className="flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" checked={f.showClosed} onChange={(e) => set({ showClosed: e.target.checked })} className="size-4 accent-brand-600" />
            הצג משרות שנסגרו (14 הימים האחרונים)
          </label>
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-slate-100 bg-white p-4 md:absolute dark:border-slate-800 dark:bg-slate-900">
        <button type="button" onClick={onReset} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm dark:border-slate-700">
          איפוס
        </button>
        <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white">
          הצג {resultCount} משרות
        </button>
      </div>
    </dialog>
  );
}
