import { useState } from 'react';
import type { WeekCohort } from '../../lib/stats.ts';
import { NO_REPLY_FILL, REPLIED_FILL } from './parts.tsx';

const PLOT_PX = 96;
const dayMonth = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};
const weekEnd = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
};
const range = (week: string) => `${dayMonth(week)}–${dayMonth(weekEnd(week))}`;
const describe = (w: WeekCohort) =>
  `${range(w.week)}: ${w.applications} הגשות · ${w.replied} קיבלו תשובה`;

/**
 * The applications of each week, stacked: the ones that got an answer at the baseline, the rest above
 * them. Labels only on the current week and the busiest one; every value is in the tooltip (hover or
 * focus) and in the screen-reader table. Time runs left → right, like the weekly chart in "שלי".
 */
export function WeeklyCohortChart({ weeks }: { weeks: WeekCohort[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...weeks.map((w) => w.applications), 0);
  const last = weeks.length - 1;
  const peak = weeks.findIndex((w) => w.applications === max && max > 0);
  const height = (n: number) => (n > 0 ? Math.max((n / max) * PLOT_PX, 3) : 0);

  return (
    <>
      <div dir="ltr" className="relative">
        <div
          className="flex items-end gap-1 border-b border-slate-200 dark:border-slate-700"
          style={{ height: PLOT_PX + 24 }}
        >
          {weeks.map((w, i) => {
            const noReply = w.applications - w.replied;
            const showLabel = (i === last || i === peak) && w.applications > 0;
            return (
              <div
                key={w.week}
                tabIndex={0}
                role="img"
                aria-label={describe(w)}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="relative flex h-full flex-1 cursor-default flex-col items-center justify-end outline-none"
              >
                {showLabel && (
                  <span className="mb-1 text-[11px] text-slate-600 dark:text-slate-300">
                    {w.applications}
                  </span>
                )}
                <div
                  className={`flex w-full max-w-6 flex-col gap-0.5 ${active === i ? 'opacity-80' : ''}`}
                >
                  {noReply > 0 && (
                    <div
                      className={`rounded-t ${NO_REPLY_FILL}`}
                      style={{ height: height(noReply) }}
                    />
                  )}
                  {w.replied > 0 && (
                    <div
                      className={`${REPLIED_FILL} ${noReply ? '' : 'rounded-t'}`}
                      style={{ height: height(w.replied) }}
                    />
                  )}
                </div>
                {active === i && (
                  <div
                    dir="rtl"
                    role="tooltip"
                    className={`pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg ${i < 2 ? 'left-0' : i > weeks.length - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'} bg-slate-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg dark:bg-slate-100 dark:text-slate-900`}
                  >
                    {describe(w)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1 text-[10px] text-slate-400 tabular-nums">
          {weeks.map((w, i) => (
            <span
              key={w.week}
              className={`flex-1 text-center ${i === last ? 'font-semibold text-slate-600 dark:text-slate-300' : ''}`}
            >
              {i === last ? 'השבוע' : dayMonth(w.week)}
            </span>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>הגשות לפי שבוע, וכמה מהן קיבלו תשובה</caption>
        <thead>
          <tr>
            <th>שבוע</th>
            <th>הגשות</th>
            <th>קיבלו תשובה</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <td>{range(w.week)}</td>
              <td>{w.applications}</td>
              <td>{w.replied}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
