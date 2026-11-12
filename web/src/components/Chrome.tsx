import type { ReactNode } from 'react';
import type { View } from '../lib/filters.ts';
import type { ThemePreference } from '../lib/storage.ts';
import { relativeTime } from '../lib/time.ts';
import { AutoThemeIcon, BoltIcon, ChartIcon, ListIcon, MoonIcon, PulseIcon, RadarMark, RefreshIcon, SunIcon, UserIcon } from './icons.tsx';

const THEME_NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<ThemePreference, string> = { system: 'ערכת נושא: לפי המכשיר', light: 'ערכת נושא: בהירה', dark: 'ערכת נושא: כהה' };

const ICON_BUTTON =
  'grid size-11 place-items-center rounded-full text-lg text-slate-600 transition-colors duration-150 hover:bg-slate-900/5 active:bg-slate-900/10 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-white/10 dark:active:bg-white/15';

interface HeaderProps {
  updatedAt?: string;
  now: Date;
  theme: ThemePreference;
  onTheme: (t: ThemePreference) => void;
  refreshing: boolean;
  onRefresh: () => void;
}

export function Header({ updatedAt, now, theme, onTheme, refreshing, onRefresh }: HeaderProps) {
  const Icon = theme === 'dark' ? MoonIcon : theme === 'light' ? SunIcon : AutoThemeIcon;
  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-3">
          <RadarMark className="size-9 shrink-0" />
          <div>
            <h1 className="text-[17px] leading-tight font-bold tracking-tight">
              רדאר משרות <span className="text-brand-700 dark:text-brand-500">QA</span>
            </h1>
            {updatedAt && <p className="text-xs text-muted">עודכן {relativeTime(updatedAt, now)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={ICON_BUTTON}
            aria-label="רענון — טעינת הנתונים האחרונים"
            title="רענון — טעינת הנתונים האחרונים"
          >
            <RefreshIcon className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => onTheme(THEME_NEXT[theme])}
            className={ICON_BUTTON}
            aria-label={THEME_LABEL[theme]}
            title={THEME_LABEL[theme]}
          >
            <Icon />
          </button>
        </div>
      </div>
    </header>
  );
}

const TABS: Array<{
  view: View;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
  /** What the tab's badge counts, read by screen readers ("חדש, 12 משרות חדשות"). */
  counted?: (n: number) => string;
}> = [
  { view: 'new', label: 'חדש', icon: BoltIcon, counted: (n) => (n === 1 ? 'משרה חדשה אחת' : `${n} משרות חדשות`) },
  { view: 'all', label: 'הכל', icon: ListIcon },
  { view: 'mine', label: 'שלי', icon: UserIcon, counted: (n) => (n === 1 ? 'מועמדות אחת' : `${n} מועמדויות`) },
  { view: 'stats', label: 'סטטיסטיקה', icon: ChartIcon },
  { view: 'sources', label: 'מקורות', icon: PulseIcon, counted: (n) => (n === 1 ? 'מקור אחד בבעיה' : `${n} מקורות בבעיה`) },
];

/**
 * A floating tab bar: a frosted pill above the iPhone home bar. The selected tab sits on a tinted
 * capsule that slides between tabs (no slide when the OS asks for less motion).
 */
export function BottomNav({ view, counts, onView }: { view: View; counts: Partial<Record<View, number>>; onView: (v: View) => void }) {
  const index = Math.max(0, TABS.findIndex((t) => t.view === view));
  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      aria-label="תצוגות"
    >
      <ul className="glass pointer-events-auto relative mx-auto grid max-w-md grid-cols-5 rounded-[1.75rem] border border-line p-1 shadow-float">
        <li
          aria-hidden="true"
          className="absolute inset-y-1 start-1 w-[calc((100%-0.5rem)/5)] rounded-3xl bg-brand-50 transition-transform duration-300 ease-snappy motion-reduce:transition-none dark:bg-brand-900/60"
          // RTL: the first tab is on the right, so each later tab is one capsule-width further left.
          style={{ transform: `translateX(${-100 * index}%)` }}
        />
        {TABS.map(({ view: v, label, icon: Icon, counted }) => {
          const active = v === view;
          const count = counts[v];
          return (
            <li key={v} className="relative">
              <button
                type="button"
                onClick={() => onView(v)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-3xl text-xs transition-colors duration-150 ${active ? 'font-semibold text-brand-700 dark:text-brand-100' : 'text-muted hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                <Icon className="text-xl" />
                {label}
                {count ? (
                  <>
                    <span
                      aria-hidden="true"
                      className={`absolute top-1 start-[calc(50%+6px)] min-w-5 rounded-full px-1 text-center text-xs leading-4 font-bold text-white tabular-nums ring-2 ring-surface ${v === 'sources' ? 'bg-rose-600' : 'bg-brand-700'}`}
                    >
                      {count}
                    </span>
                    {counted && <span className="sr-only">, {counted(count)}</span>}
                  </>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
