import type { ReactNode } from 'react';
import type { View } from '../lib/filters.ts';
import type { ThemePreference } from '../lib/storage.ts';
import { relativeTime } from '../lib/time.ts';
import { AutoThemeIcon, ChartIcon, ListIcon, MoonIcon, OverviewIcon, PulseIcon, RadarMark, RefreshIcon, SunIcon, UserIcon } from './icons.tsx';

const THEME_NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<ThemePreference, string> = { system: 'ערכת נושא: לפי המכשיר', light: 'ערכת נושא: בהירה', dark: 'ערכת נושא: כהה' };

const ICON_BUTTON =
  'grid size-11 place-items-center rounded-full text-lg text-slate-600 transition-colors duration-150 hover:bg-slate-900/5 active:bg-slate-900/10 disabled:opacity-60 lg:border lg:border-line lg:bg-surface lg:hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/10 dark:active:bg-white/15 dark:lg:hover:bg-slate-800';

interface HeaderProps {
  updatedAt?: string;
  now: Date;
  theme: ThemePreference;
  onTheme: (t: ThemePreference) => void;
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * Phone: a frosted bar across the top with the logo. Desktop: the logo moves to the side menu and the
 * header is a floating frosted strip above the content (when the data was updated, refresh, theme).
 */
export function Header({ updatedAt, now, theme, onTheme, refreshing, onRefresh }: HeaderProps) {
  const Icon = theme === 'dark' ? MoonIcon : theme === 'light' ? SunIcon : AutoThemeIcon;
  return (
    <header className="max-lg:glass sticky top-0 z-30 max-lg:border-b max-lg:border-line lg:pt-4">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5 lg:glass lg:max-w-[76rem] lg:rounded-[1.375rem] lg:border lg:border-white/70 lg:py-2 lg:ps-5 lg:pe-2 lg:shadow-card dark:lg:border-line">
        <div className="flex items-center gap-3">
          <RadarMark className="size-10 shrink-0 lg:hidden" />
          <div>
            <h1 className="text-[17px] leading-tight font-semibold tracking-tight lg:sr-only">רדאר משרות QA</h1>
            {updatedAt && (
              <p className="flex items-center gap-2 text-xs text-muted lg:text-sm">
                <span className="size-2 shrink-0 rounded-full bg-mint-500 ring-4 ring-mint-500/15" aria-hidden="true" />
                עודכן {relativeTime(updatedAt, now)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 lg:gap-2">
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
  /** What the tab's badge counts, read by screen readers ("סקירה, 12 משרות חדשות"). */
  counted?: (n: number) => string;
}> = [
  { view: 'new', label: 'סקירה', icon: OverviewIcon, counted: (n) => (n === 1 ? 'משרה חדשה אחת' : `${n} משרות חדשות`) },
  { view: 'all', label: 'הכל', icon: ListIcon },
  { view: 'mine', label: 'שלי', icon: UserIcon, counted: (n) => (n === 1 ? 'מועמדות אחת' : `${n} מועמדויות`) },
  { view: 'stats', label: 'סטטיסטיקה', icon: ChartIcon },
  { view: 'sources', label: 'מקורות', icon: PulseIcon, counted: (n) => (n === 1 ? 'מקור אחד בבעיה' : `${n} מקורות בבעיה`) },
];

/**
 * The view menu — one element on every screen size. On a phone, a frosted pill floating above the
 * iPhone home bar, where the selected tab sits on a capsule that slides between tabs. From 1024 px,
 * a frosted side menu on the right: the logo, the views, and `footer` at the bottom.
 */
export function ViewNav({
  view,
  counts,
  onView,
  footer,
}: {
  view: View;
  counts: Partial<Record<View, number>>;
  onView: (v: View) => void;
  footer?: ReactNode;
}) {
  const index = Math.max(0, TABS.findIndex((t) => t.view === view));
  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:glass lg:pointer-events-auto lg:inset-x-auto lg:start-4 lg:top-4 lg:bottom-4 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:gap-7 lg:overflow-y-auto lg:rounded-[1.75rem] lg:border lg:border-white/70 lg:p-4 lg:shadow-float dark:lg:border-line"
      aria-label="תצוגות"
    >
      <div className="hidden items-center gap-3 px-2 pt-1 lg:flex" aria-hidden="true">
        <RadarMark className="size-10 shrink-0" />
        <span className="text-[17px] font-semibold tracking-tight">רדאר משרות QA</span>
      </div>
      <ul className="glass pointer-events-auto relative mx-auto grid max-w-md grid-cols-5 rounded-[1.75rem] border border-line p-1 shadow-float lg:mx-0 lg:flex lg:max-w-none lg:flex-col lg:gap-1 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
        <li
          aria-hidden="true"
          className="absolute inset-y-1 start-1 w-[calc((100%-0.5rem)/5)] rounded-3xl bg-brand-50 transition-transform duration-300 ease-snappy motion-reduce:transition-none lg:hidden dark:bg-brand-900/60"
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
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-3xl text-xs transition-colors duration-150 lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-3 lg:text-[15px] ${
                  active
                    ? 'font-semibold text-brand-700 lg:bg-surface lg:shadow-card dark:text-brand-100 dark:lg:bg-slate-800'
                    : 'text-muted hover:text-slate-800 lg:text-slate-600 lg:hover:bg-surface/60 dark:hover:text-slate-100 dark:lg:text-slate-300 dark:lg:hover:bg-white/5'
                }`}
              >
                <Icon className="text-xl" />
                <span className="lg:flex-1 lg:text-start">{label}</span>
                {count ? (
                  <>
                    <span
                      aria-hidden="true"
                      className={`absolute top-1 start-[calc(50%+6px)] min-w-5 rounded-full px-1 text-center text-xs leading-4 font-semibold tabular-nums ring-2 ring-surface lg:static lg:min-w-6 lg:px-1.5 lg:leading-5 lg:ring-0 ${
                        v === 'sources'
                          ? 'bg-rose-600 text-white lg:bg-rose-100 lg:text-rose-800 dark:lg:bg-rose-950 dark:lg:text-rose-200'
                          : 'bg-brand-700 text-white'
                      }`}
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
      {footer && <div className="mt-auto hidden lg:block">{footer}</div>}
    </nav>
  );
}
