import { useEffect, useRef, type ReactNode } from 'react';
import type { Sync } from '../../lib/sync/useSync.ts';
import { relativeTime } from '../../lib/time.ts';
import { AlertIcon, CloudIcon } from '../icons.tsx';

const CARD = 'rounded-3xl border border-line bg-surface p-4 shadow-card lg:p-5';
const PRIMARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-700 px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-800';
const SECONDARY =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-medium transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800';

interface Props {
  sync: Sync;
  now: Date;
}

/** "סנכרון בין מכשירים" in "שלי": sign in with Google once per device; "שלי" then follows me everywhere. */
export function SyncPanel({ sync, now }: Props) {
  const ref = useRef<HTMLElement>(null);
  const { state, prepare } = sync;
  const idle = state.kind === 'idle';

  // Fetch the sync code once the card is in view, so a tap on "התחברות" opens Google's window at once.
  useEffect(() => {
    const card = ref.current;
    if (!idle || !card || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        prepare();
      },
      { rootMargin: '200px' },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [idle, prepare]);

  if (!sync.available) return null;

  const email = 'email' in state && state.email ? <bdi>{state.email}</bdi> : null;
  const signedIn =
    ['connecting', 'offline', 'saving', 'synced'].includes(state.kind) ||
    (state.kind === 'error' && 'email' in state && Boolean(state.email));
  let line: ReactNode;
  let tone = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  switch (state.kind) {
    case 'idle':
    case 'signed-out':
      line = 'לא מחובר — כרגע "שלי" נשמר רק בדפדפן הזה.';
      break;
    case 'loading':
      line = 'טוען…';
      break;
    case 'connecting':
      line = <>מתחבר{email && <> בתור {email}</>}…</>;
      tone = 'bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-100';
      break;
    case 'offline':
      line = 'אין חיבור לרשת. השינויים נשמרים כאן ויישלחו כשהחיבור יחזור.';
      tone = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
      break;
    case 'saving':
      line = 'שומר בענן…';
      tone = 'bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-100';
      break;
    case 'synced':
      line = (
        <>
          מסונכרן{email && <> · {email}</>} · עודכן {relativeTime(state.at, now)}
        </>
      );
      tone = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
      break;
    case 'error':
      line = 'הסנכרון נעצר.';
      tone = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
      break;
  }
  const message =
    state.kind === 'error'
      ? state.message
      : state.kind === 'signed-out'
        ? state.message
        : undefined;

  return (
    <section ref={ref} id="sync" aria-labelledby="sync-title" className={CARD}>
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full text-lg ${tone}`}>
          <CloudIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="sync-title" className="font-semibold">
            סנכרון בין מכשירים
          </h3>
          <p role="status" className="mt-0.5 text-sm text-muted">
            {line}
          </p>
        </div>
      </div>

      {message && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-300"
        >
          <AlertIcon className="mt-0.5 shrink-0" />
          {message}
        </p>
      )}

      {!signedIn && state.kind !== 'loading' && (
        <p className="mt-3 max-w-prose text-sm">
          מתחברים עם אותו חשבון Google בכל מכשיר, והמועמדויות, ההערות, הסדר והכישורים מקורות החיים
          מופיעים בכולם — גם בלי רשת, עם עדכון כשהחיבור חוזר. קובץ קורות החיים עצמו לא עולה לענן.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {(state.kind === 'idle' || state.kind === 'signed-out') && (
          <button type="button" className={PRIMARY} onClick={sync.signIn}>
            התחברות עם Google
          </button>
        )}
        {state.kind === 'error' && (
          <button type="button" className={PRIMARY} onClick={sync.retry}>
            ניסיון נוסף
          </button>
        )}
        {signedIn && (
          <>
            <button type="button" className={SECONDARY} onClick={sync.signOut}>
              ניתוק המכשיר הזה
            </button>
            <span className="text-xs text-muted">הנתונים נשארים גם כאן וגם בענן.</span>
          </>
        )}
      </div>
    </section>
  );
}
