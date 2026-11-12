import { useCallback, useMemo, useState } from 'react';
import type { Job, SourceHealth } from '@qa-radar/shared';
import { buildItems } from '../lib/mine.ts';
import {
  collectFacts,
  computeStats,
  rate,
  STATS_PERIOD_LABELS,
  STATS_PERIODS,
  type FunnelStage,
  type StatsPeriod,
  type Tally,
} from '../lib/stats.ts';
import type { StatusEntry } from '../lib/storage.ts';
import { formatDate } from '../lib/time.ts';
import { Tile } from './mine/MineSummary.tsx';
import { Card, Legend, MeterRow, NO_REPLY_FILL, OutOf, REPLIED_FILL } from './stats/parts.tsx';
import { WeeklyCohortChart } from './stats/WeeklyCohortChart.tsx';

interface Props {
  statuses: Record<string, StatusEntry>;
  jobsById: Map<string, Job>;
  sourceById: Map<string, SourceHealth>;
  now: Date;
  onOpenMine: () => void;
}

const FUNNEL_LABELS: Record<FunnelStage, string> = {
  applied: 'הגשות',
  replied: 'קיבלו תשובה',
  conversation: 'הגיעו לשיחה',
  interview: 'הגיעו לראיון',
  offer: 'קיבלו הצעה',
};
/** What a step's rate is out of: the stage before it. */
const FUNNEL_BASE: Partial<Record<FunnelStage, string>> = {
  replied: 'מההגשות',
  conversation: 'מאלה שענו',
  interview: 'מהשיחות',
  offer: 'מהראיונות',
};

const days = (n: number) =>
  n === 0
    ? 'באותו יום'
    : n === 1
      ? 'יום אחד'
      : n === 2
        ? 'יומיים'
        : `${Number.isInteger(n) ? n : n.toFixed(1)} ימים`;

function useStatsPeriod() {
  const [period, setState] = useState<StatsPeriod>(() => {
    const value = new URLSearchParams(window.location.search).get('sp') as StatsPeriod | null;
    return value && STATS_PERIODS.includes(value) ? value : 'all';
  });
  const setPeriod = useCallback((next: StatsPeriod) => {
    setState(next);
    const p = new URLSearchParams(window.location.search);
    if (next === 'all') p.delete('sp');
    else p.set('sp', next);
    const qs = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, []);
  return [period, setPeriod] as const;
}

const tallyRow = (t: Tally) => ({
  parts: [
    { value: t.replied, fill: REPLIED_FILL },
    { value: t.applications - t.replied, fill: NO_REPLY_FILL },
  ],
  figure: <OutOf count={t.replied} of={t.applications} pct={rate(t.replied, t.applications)} />,
});

/** "סטטיסטיקה": where my applications go, computed from the statuses saved in this browser. */
export function StatsView({ statuses, jobsById, sourceById, now, onOpenMine }: Props) {
  const [period, setPeriod] = useStatsPeriod();
  const facts = useMemo(
    () => collectFacts(buildItems(statuses, jobsById), (id) => sourceById.get(id)),
    [statuses, jobsById, sourceById],
  );
  const stats = useMemo(() => computeStats(facts, now, period), [facts, now, period]);

  if (!facts.length) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-muted dark:border-slate-700">
        עוד אין הגשות לנתח. סמן/י "הגשתי" על משרה, או הוסף/י מועמדות ידנית ב
        <button
          type="button"
          onClick={onOpenMine}
          className="tap-44 text-brand-700 underline dark:text-brand-500"
        >
          לשונית "שלי"
        </button>
        .
      </p>
    );
  }

  const silence14 = stats.silences.find((s) => s.days === 14);
  const silent14Pct = silence14 ? rate(silence14.noReply, silence14.eligible) : undefined;
  const replyPct = rate(stats.replied, stats.applications);
  const funnelMax = stats.funnel[0]?.count ?? 0;
  const submitterMax = Math.max(...stats.submitters.map((r) => r.applications), 0);
  const originMax = Math.max(stats.radar.applications, stats.manual.applications);
  const bucketMax = Math.max(...stats.delays.buckets.map((b) => b.count), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">תקופה</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as StatsPeriod)}
            className={`min-h-11 rounded-full border px-3 text-sm ${
              period !== 'all'
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            {STATS_PERIODS.map((p) => (
              <option key={p} value={p}>
                {STATS_PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted">לפי תאריך ההגשה · מחושב מהמועמדויות שבדפדפן הזה</p>
      </div>

      {!stats.applications ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-muted dark:border-slate-700">
          אין הגשות ב{STATS_PERIOD_LABELS[period]}.{' '}
          <button
            type="button"
            onClick={() => setPeriod('all')}
            className="tap-44 text-brand-700 underline dark:text-brand-500"
          >
            הצג את כל התקופה
          </button>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Tile
              label="הגשות"
              value={stats.applications}
              sub={
                period === 'all' && stats.firstAppliedAt
                  ? `מאז ${formatDate(stats.firstAppliedAt)}`
                  : STATS_PERIOD_LABELS[period]
              }
            />
            <Tile
              label="קיבלו תשובה"
              value={replyPct !== undefined ? `${replyPct}%` : stats.replied}
              sub={`${stats.replied} מתוך ${stats.applications}`}
            />
            {/* The label stays one line on a phone so the three values line up; the sub says when. */}
            <Tile
              label="לא ענו"
              value={
                silence14?.eligible
                  ? silent14Pct !== undefined
                    ? `${silent14Pct}%`
                    : silence14.noReply
                  : '—'
              }
              sub={
                silence14?.eligible
                  ? `${silence14.noReply} מתוך ${silence14.eligible} · אחרי 14 יום`
                  : 'עוד אין הגשות בנות 14 יום'
              }
            />
          </div>

          <Card title="המשפך" subtitle="כמה מההגשות הגיעו לכל שלב">
            <ol className="space-y-2.5">
              {stats.funnel.map((row) => {
                const pct = row.of !== undefined ? rate(row.count, row.of) : undefined;
                return (
                  <MeterRow
                    key={row.stage}
                    name={FUNNEL_LABELS[row.stage]}
                    max={funnelMax}
                    parts={[{ value: row.count, fill: REPLIED_FILL }]}
                    figure={
                      <>
                        <span className="font-semibold">{row.count}</span>
                        {pct !== undefined && (
                          <span className="text-xs text-muted">
                            {' '}
                            · {pct}% {FUNNEL_BASE[row.stage]}
                          </span>
                        )}
                      </>
                    }
                  />
                );
              })}
            </ol>
            <p className="text-xs text-muted">
              בדרך: {stats.homeAssignments} עבודות בית · {stats.frontals} ראיונות פרונטליים ·{' '}
              {stats.rejected} נדחו · {stats.inProcess} עדיין בתהליך
            </p>
            <p className="text-xs text-muted">
              תשובה = כל תגובה, גם דחייה. שיחה = שיחה ממגייסת, עבודת בית, ראיון או הצעה.
            </p>
          </Card>

          <Card title="תשובות לפי חברת השמה" subtitle="או לפי החברה, כשהגשת אליה ישירות">
            <Legend />
            <ol className="space-y-2.5">
              {stats.submitters.map((row) => (
                <MeterRow
                  key={row.name}
                  name={row.names ? `אחרים (${row.names})` : <bdi title={row.name}>{row.name}</bdi>}
                  max={submitterMax}
                  {...tallyRow(row)}
                />
              ))}
            </ol>
            <div className="space-y-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
              <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                מהרדאר מול הוספה ידנית
              </h4>
              <ul className="space-y-2.5">
                {stats.radar.applications > 0 && (
                  <MeterRow name="משרות מהרדאר" max={originMax} {...tallyRow(stats.radar)} />
                )}
                {stats.manual.applications > 0 && (
                  <MeterRow name="הוספתי ידנית" max={originMax} {...tallyRow(stats.manual)} />
                )}
              </ul>
              {stats.manual.applications > 0 && (
                <p className="text-xs text-muted">
                  מועמדות ידנית נרשמת לרוב אחרי שמישהו כבר התקשר, ולכן יש בה יותר תשובות.
                </p>
              )}
            </div>
          </Card>

          {stats.weekly.length > 0 && (
            <Card
              title="הגשות לפי שבוע"
              subtitle={`וכמה מהן קיבלו תשובה · ${stats.weekly.length === 1 ? 'השבוע' : `${stats.weekly.length} שבועות`}`}
            >
              <Legend />
              <WeeklyCohortChart weeks={stats.weekly} />
              <p className="text-xs text-muted">
                להגשות מהשבועות האחרונים עוד יכולה להגיע תשובה.
                {stats.undated > 0 && ` ${stats.undated} הגשות בלי תאריך לא מוצגות כאן.`}
              </p>
            </Card>
          )}

          <Card
            title="זמן עד תשובה"
            subtitle={
              stats.delays.medianDays !== undefined
                ? `חציון: ${days(stats.delays.medianDays)} · לפי ${stats.delays.known} תשובות עם תאריך ידוע`
                : 'עוד אין תשובות עם תאריך ידוע'
            }
          >
            {stats.delays.known > 0 && (
              <ol className="space-y-2.5">
                {stats.delays.buckets.map((b) => {
                  const pct = rate(b.count, stats.delays.known);
                  return (
                    <MeterRow
                      key={b.label}
                      name={b.label}
                      max={bucketMax}
                      parts={[{ value: b.count, fill: REPLIED_FILL }]}
                      figure={
                        <>
                          <span className="font-semibold">{b.count}</span>
                          {pct !== undefined && (
                            <span className="text-xs text-muted"> · {pct}%</span>
                          )}
                        </>
                      }
                    />
                  );
                })}
              </ol>
            )}
            <ul className="space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
              {stats.silences.map((s) => (
                <li key={s.days} className="flex items-baseline justify-between gap-3">
                  <span>בלי תשובה אחרי {s.days} יום</span>
                  <span className="tabular-nums">
                    {s.eligible ? (
                      <OutOf count={s.noReply} of={s.eligible} pct={rate(s.noReply, s.eligible)} />
                    ) : (
                      <span className="text-xs text-muted">
                        אין עדיין הגשות בנות {s.days} יום
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {stats.delays.estimated > 0 && (
              <p className="text-xs text-muted">
                {stats.delays.estimated === 1
                  ? 'תשובה אחת עם תאריך משוער לא נספרה כאן'
                  : `${stats.delays.estimated} תשובות עם תאריך משוער לא נספרו כאן`}{' '}
                — אפשר לתקן את התאריך ב"מהלך המועמדות" שבלשונית "שלי".
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
