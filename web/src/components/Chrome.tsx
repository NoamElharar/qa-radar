import type { ReactNode } from 'react';
import type { View } from '../lib/filters.ts';
import type { ThemePreference } from '../lib/storage.ts';
import { relativeTime } from '../lib/time.ts';
import { AutoThemeIcon, BoltIcon, ChartIcon, ListIcon, MoonIcon, PulseIcon, RefreshIcon, SunIcon, UserIcon } from './icons.tsx';

const THEME_NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<ThemePreference, string> = { system: 'ערכת נושא: לפי המכשיר', light: 'ערכת נושא: בהירה', dark: 'ערכת נושא: כהה' };

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
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div>
          <h1 className="text-lg leading-tight font-bold">
            רדאר משרות <span className="text-brand-700 dark:text-brand-500">QA</span>
          </h1>
          {updatedAt && <p className="text-xs text-muted">עודכן {relativeTime(updatedAt, now)}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="grid size-11 place-items-center rounded-full text-lg text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="רענון — טעינת הנתונים האחרונים"
            title="רענון — טעינת הנתונים האחרונים"
          >
            <RefreshIcon className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => onTheme(THEME_NEXT[theme])}
            className="grid size-11 place-items-center rounded-full text-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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

export function BottomNav({ view, counts, onView }: { view: View; counts: Partial<Record<View, number>>; onView: (v: View) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
      aria-label="תצוגות"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5">
        {TABS.map(({ view: v, label, icon: Icon, counted }) => {
          const active = v === view;
          const count = counts[v];
          return (
            <li key={v}>
              <button
                type="button"
                onClick={() => onView(v)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex w-full flex-col items-center gap-0.5 py-2 text-xs ${active ? 'font-semibold text-brand-700 dark:text-brand-500' : 'text-muted'}`}
              >
                <Icon className="text-xl" />
                {label}
                {count ? (
                  <>
                    <span
                      aria-hidden="true"
                      className={`absolute top-1 start-[calc(50%+6px)] min-w-5 rounded-full px-1 text-center text-xs leading-4 font-bold text-white tabular-nums ${v === 'sources' ? 'bg-rose-600' : 'bg-brand-700'}`}
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
