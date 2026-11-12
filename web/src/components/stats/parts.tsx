import type { ReactNode } from 'react';

/*
 * The building blocks of "סטטיסטיקה". One encoding across the page (emphasis form): answers in the
 * brand accent, applications with no answer in a recessive gray. Checked with the dataviz palette
 * validator on the card surfaces: #0d9488 passes the band, chroma and 3:1 contrast in both modes, and
 * sits ΔE 24 (light) / 16 (dark, deutan) from the gray. The gray is under 3:1 by design, so every
 * value is also printed as text (or in a screen-reader table for the weekly chart).
 */
export const REPLIED_FILL = 'bg-brand-600';
export const NO_REPLY_FILL = 'bg-slate-300 dark:bg-slate-600';

export function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <header>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
      <li className="flex items-center gap-1.5">
        <span className={`size-2.5 rounded-sm ${REPLIED_FILL}`} aria-hidden="true" />
        קיבלו תשובה
      </li>
      <li className="flex items-center gap-1.5">
        <span className={`size-2.5 rounded-sm ${NO_REPLY_FILL}`} aria-hidden="true" />
        בלי תשובה
      </li>
    </ul>
  );
}

export interface BarPart {
  value: number;
  fill: string;
}

/**
 * A horizontal bar on a shared scale: it grows from the start edge (the right, in Hebrew), with a 2px
 * gap between its parts and a rounded data end. Decorative: its row prints the same numbers.
 */
export function HBar({ parts, max }: { parts: BarPart[]; max: number }) {
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div className="flex h-3 w-full gap-0.5" aria-hidden="true">
      {max > 0 &&
        shown.map((p, i) => (
          <span
            key={i}
            className={`h-full ${p.fill} ${i === shown.length - 1 ? 'rounded-e' : ''}`}
            style={{ width: `${(p.value / max) * 100}%`, minWidth: 4 }}
          />
        ))}
    </div>
  );
}

/**
 * One row of a meter list: the name and its figure on one line, the bar under them on a phone and
 * between them on a wider screen.
 */
export function MeterRow({
  name,
  figure,
  parts,
  max,
}: {
  name: ReactNode;
  figure: ReactNode;
  parts: BarPart[];
  max: number;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
      <span className="truncate text-sm">{name}</span>
      <span className="text-end text-sm tabular-nums sm:col-start-3 sm:row-start-1">{figure}</span>
      <div className="col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <HBar parts={parts} max={max} />
      </div>
    </li>
  );
}

/** "4 מתוך 20 · 20%", with the rate only when there are enough applications for it to mean anything. */
export function OutOf({ count, of, pct }: { count: number; of: number; pct?: number }) {
  return (
    <>
      <span className="font-semibold">{count}</span>
      <span className="text-slate-500"> מתוך {of}</span>
      {pct !== undefined && <span className="text-slate-500"> · {pct}%</span>}
    </>
  );
}
