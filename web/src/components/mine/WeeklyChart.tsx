import { useState } from 'react';
import type { WeekCount } from '../../lib/mine.ts';

const PLOT_PX = 72;
const dayMonth = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};
const weekEnd = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
};

/**
 * Applications per week — one series, so no legend. Emphasis form: the current week in the accent,
 * earlier weeks in a recessive gray. Labels only on the current week and the peak; every value is in
 * the tooltip and in the (screen-reader) table. Time runs left → right like any chart.
 */
export function WeeklyChart({ weeks }: { weeks: WeekCount[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...weeks.map((w) => w.count), 0);
  const last = weeks.length - 1;
  const peak = weeks.findIndex((w) => w.count === max && max > 0);

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">הגשות לפי שבוע</span>
        <span className="text-xs text-slate-500">{weeks.length} השבועות האחרונים</span>
      </figcaption>

      <div dir="ltr" className="relative mt-3">
        <div className="flex items-end gap-1 border-b border-slate-200 dark:border-slate-700" style={{ height: PLOT_PX + 18 }}>
          {weeks.map((w, i) => {
            const height = max ? Math.max((w.count / max) * PLOT_PX, w.count ? 3 : 0) : 0;
            const showLabel = (i === last || i === peak) && w.count > 0;
            return (
              <div
                key={w.week}
                tabIndex={0}
                role="img"
                aria-label={`שבוע ${dayMonth(w.week)}–${dayMonth(weekEnd(w.week))}: ${w.count} הגשות`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="relative flex h-full flex-1 cursor-default flex-col items-center justify-end outline-none"
              >
                {showLabel && <span className="mb-1 text-[11px] text-slate-600 dark:text-slate-300">{w.count}</span>}
                <div
                  className={`w-full max-w-6 rounded-t ${
                    i === last ? 'bg-brand-600 dark:bg-brand-500' : 'bg-slate-300 dark:bg-slate-600'
                  } ${active === i ? 'opacity-80' : ''}`}
                  style={{ height }}
                />
                {active === i && (
                  <div
                    dir="rtl"
                    className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg bg-slate-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
                  >
                    {dayMonth(w.week)}–{dayMonth(weekEnd(w.week))}: {w.count} הגשות
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1 text-[10px] text-slate-400 tabular-nums">
          {weeks.map((w, i) => (
            <span key={w.week} className={`flex-1 text-center ${i === last ? 'font-semibold text-slate-600 dark:text-slate-300' : ''}`}>
              {i === last ? 'השבוע' : dayMonth(w.week)}
            </span>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>הגשות לפי שבוע</caption>
        <thead>
          <tr>
            <th>שבוע</th>
            <th>הגשות</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <td>
                {dayMonth(w.week)}–{dayMonth(weekEnd(w.week))}
              </td>
              <td>{w.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
