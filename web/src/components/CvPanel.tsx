import { useId, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { profileOf, type Job, type ScoreProfile, type ScoringConfig } from '@qa-radar/shared';
import {
  CV_ACCEPT,
  CvReadError,
  cvProfile,
  findSkills,
  matchSummary,
  missingSkills,
  readCvFile,
  STRONG_MATCH,
  type MatchSummary,
} from '../lib/cv.ts';
import type { CvProfile } from '../lib/storage.ts';
import { formatDate } from '../lib/time.ts';
import { AlertIcon, CloseIcon, UploadDocIcon } from './icons.tsx';

const CARD = 'rounded-3xl border border-line bg-surface p-4 shadow-card lg:p-5';
const PRIMARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-700 px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-800 disabled:cursor-wait disabled:opacity-70';
const SECONDARY =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-medium transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800';
const LINK =
  'tap-44 text-sm font-medium text-brand-700 underline underline-offset-2 dark:text-brand-500';

interface Props {
  /** "home": a compact card on the overview. "full": the whole panel, in "שלי". */
  variant: 'home' | 'full';
  cv?: CvProfile;
  /** From jobs.json; missing in data collected before CV matching existed. */
  scoring?: ScoringConfig;
  /** Jobs as collected (scored against the fixed profile): the comparison and the tips use them. */
  jobs: readonly Job[];
  onChange: (cv: CvProfile | undefined) => void;
  /** Home card: opens the full panel in "שלי". */
  onManage?: () => void;
}

interface Draft {
  skills: string[];
  yearsExperience: number;
  fileName?: string;
  /** A new file or text was analyzed (else: editing the saved skills). */
  analyzed: boolean;
}

type Step =
  | { kind: 'idle' }
  | { kind: 'chosen'; file: File }
  | { kind: 'reading'; name: string }
  | { kind: 'review'; draft: Draft };

/** "התאמה לפי קורות החיים": upload a CV once in a while; jobs are scored against the skills in it. */
export function CvPanel({ variant, cv, scoring, jobs, onChange, onManage }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState<string>();
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const titleId = useId();

  if (!scoring) {
    // Data from before jobs listed their skills: nothing to match against yet.
    if (variant === 'home') return null;
    return (
      <section id="cv" aria-labelledby={titleId} className={`${CARD} scroll-mt-24 lg:scroll-mt-28`}>
        <h3 id={titleId} className="text-base font-semibold">
          התאמה לפי קורות החיים
        </h3>
        <p className="mt-1 text-sm text-muted">
          יהיה זמין אחרי עדכון הנתונים הבא (בדרך כלל תוך שעה).
        </p>
      </section>
    );
  }

  const analyze = async (source: { file: File } | { text: string }) => {
    setError(undefined);
    const name = 'file' in source ? source.file.name : 'טקסט שהודבק';
    setStep({ kind: 'reading', name });
    try {
      const text = 'file' in source ? await readCvFile(source.file) : source.text;
      setStep({
        kind: 'review',
        draft: {
          skills: findSkills(text, scoring.skills),
          yearsExperience: cv?.yearsExperience ?? scoring.yearsExperience,
          fileName: 'file' in source ? source.file.name : undefined,
          analyzed: true,
        },
      });
      setPasting(false);
      setPasted('');
    } catch (e) {
      setError(
        e instanceof CvReadError
          ? e.message
          : 'לא הצלחתי לקרוא את הקובץ. נסה/י קובץ אחר, או הדבק/י את הטקסט.',
      );
      setStep('file' in source ? { kind: 'chosen', file: source.file } : { kind: 'idle' });
    }
  };

  const choose = (file: File | undefined) => {
    if (!file) return;
    setError(undefined);
    setStep({ kind: 'chosen', file });
  };

  const save = (draft: Draft) => {
    const at = new Date().toISOString();
    // A new analysis names its own file (none for pasted text); editing keeps the saved one.
    const fileName = draft.analyzed ? draft.fileName : cv?.fileName;
    onChange({
      skills: draft.skills,
      yearsExperience: draft.yearsExperience,
      active: true,
      ...(fileName ? { fileName } : {}),
      analyzedAt: draft.analyzed || !cv ? at : cv.analyzedAt,
      updatedAt: at,
    });
    setStep({ kind: 'idle' });
  };

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h3 id={titleId} className="text-base font-semibold">
        התאמה לפי קורות החיים
      </h3>
      {cv && step.kind === 'idle' && (
        <CvSwitch
          on={cv.active}
          onToggle={() =>
            onChange({ ...cv, active: !cv.active, updatedAt: new Date().toISOString() })
          }
        />
      )}
    </div>
  );

  let body: ReactNode;
  if (step.kind === 'review') {
    body = (
      <Review
        draft={step.draft}
        scoring={scoring}
        jobs={jobs}
        current={cv?.active ? cvProfile(scoring, cv) : profileOf(scoring)}
        currentLabel={cv?.active ? 'קורות החיים הנוכחיים' : 'הפרופיל הקבוע'}
        onDraft={(draft) => setStep({ kind: 'review', draft })}
        onSave={save}
        onCancel={() => setStep({ kind: 'idle' })}
      />
    );
  } else if (step.kind === 'reading') {
    body = (
      <p role="status" className="mt-3 flex items-center gap-2 text-sm">
        <span
          className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent motion-reduce:animate-none"
          aria-hidden="true"
        />
        קורא את <bdi className="font-medium">{step.name}</bdi>…
      </p>
    );
  } else if (step.kind === 'chosen') {
    body = (
      <div className="mt-3 space-y-3">
        <p className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-800/60">
          <UploadDocIcon className="size-5 shrink-0 text-brand-700 dark:text-brand-500" />
          <bdi className="min-w-0 truncate font-medium">{step.file.name}</bdi>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={PRIMARY}
            onClick={() => void analyze({ file: step.file })}
          >
            נתח קורות חיים
          </button>
          <button type="button" className={SECONDARY} onClick={() => setStep({ kind: 'idle' })}>
            ביטול
          </button>
        </div>
      </div>
    );
  } else if (!cv) {
    body = (
      <>
        <p className="mt-1 text-sm text-muted">
          העלה/י את קורות החיים, והרדאר יחשב את ציון ההתאמה של כל משרה לפי הכישורים שמופיעים בהם.
          מספיק פעם אחת — מעלים שוב רק כשמעדכנים את קורות החיים.
        </p>
        <Dropzone onFile={choose} />
        <PasteText
          pasting={pasting}
          pasted={pasted}
          onPasting={setPasting}
          onPasted={setPasted}
          onAnalyze={(text) => void analyze({ text })}
        />
      </>
    );
  } else {
    body = (
      <Saved
        cv={cv}
        scoring={scoring}
        jobs={jobs}
        compact={variant === 'home'}
        onEdit={() =>
          setStep({
            kind: 'review',
            draft: { skills: cv.skills, yearsExperience: cv.yearsExperience, analyzed: false },
          })
        }
        onReplace={choose}
        onDelete={() => {
          if (
            window.confirm('למחוק את הכישורים מקורות החיים? הציון יחזור להיות לפי הפרופיל הקבוע.')
          )
            onChange(undefined);
        }}
        onManage={onManage}
      />
    );
  }

  return (
    <section
      id={variant === 'full' ? 'cv' : undefined}
      aria-labelledby={titleId}
      className={`${CARD} scroll-mt-24 lg:scroll-mt-28`}
    >
      {heading}
      {error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-2xl bg-rose-50 px-3 py-2.5 text-sm text-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
        >
          <AlertIcon className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {body}
      <p className="mt-3 text-xs text-muted">
        הקובץ נקרא בדפדפן בלבד ולא נשלח לשום מקום. נשמרת רק רשימת הכישורים.
      </p>
    </section>
  );
}

function CvSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="inline-flex min-h-11 items-center gap-2 text-sm"
    >
      <span
        aria-hidden="true"
        className={`relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none ${
          on ? 'bg-brand-700' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[inset-inline-start] duration-150 motion-reduce:transition-none ${
            on ? 'start-[1.375rem]' : 'start-0.5'
          }`}
        />
      </span>
      ציון לפי קורות החיים
    </button>
  );
}

function Dropzone({ onFile }: { onFile: (file: File | undefined) => void }) {
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onFile(e.dataTransfer.files[0]);
  };
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`relative mt-3 flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-150 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/30 hover:border-brand-500 ${
        over
          ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30'
          : 'border-slate-300 dark:border-slate-600'
      }`}
    >
      <UploadDocIcon className="size-8 text-brand-700 dark:text-brand-500" />
      <span className="font-medium">
        גרור/י לכאן את קורות החיים, או{' '}
        <span className="text-brand-700 underline underline-offset-2 dark:text-brand-500">
          בחר/י קובץ
        </span>
      </span>
      <span className="text-xs text-muted">PDF או Word (‎.docx‎)</span>
      {/* Invisible, over the whole box: the box is what you tap, focus and drop a file on. */}
      <input
        type="file"
        accept={CV_ACCEPT}
        aria-label="בחירת קובץ קורות חיים"
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function PasteText({
  pasting,
  pasted,
  onPasting,
  onPasted,
  onAnalyze,
}: {
  pasting: boolean;
  pasted: string;
  onPasting: (open: boolean) => void;
  onPasted: (text: string) => void;
  onAnalyze: (text: string) => void;
}) {
  const id = useId();
  if (!pasting) {
    return (
      <p className="mt-2 text-sm">
        <button type="button" className={LINK} onClick={() => onPasting(true)}>
          או הדבק/י את הטקסט
        </button>
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        טקסט קורות החיים
      </label>
      <textarea
        id={id}
        value={pasted}
        onChange={(e) => onPasted(e.target.value)}
        rows={6}
        dir="auto"
        className="block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={PRIMARY}
          disabled={!pasted.trim()}
          onClick={() => onAnalyze(pasted)}
        >
          נתח טקסט
        </button>
        <button type="button" className={SECONDARY} onClick={() => onPasting(false)}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function Review({
  draft,
  scoring,
  jobs,
  current,
  currentLabel,
  onDraft,
  onSave,
  onCancel,
}: {
  draft: Draft;
  scoring: ScoringConfig;
  jobs: readonly Job[];
  current: ScoreProfile;
  currentLabel: string;
  onDraft: (draft: Draft) => void;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const yearsId = useId();
  const before = useMemo(() => matchSummary(jobs, current), [jobs, current]);
  const after = useMemo(
    () => matchSummary(jobs, cvProfile(scoring, draft)),
    [jobs, scoring, draft],
  );
  const others = scoring.skills.map((s) => s.label).filter((l) => !draft.skills.includes(l));
  const order = new Map(scoring.skills.map((s, i) => [s.label, i]));
  const add = (label: string) =>
    onDraft({
      ...draft,
      skills: [...draft.skills, label].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
    });

  return (
    <div className="mt-3 space-y-4">
      <div>
        <h4 className="text-sm font-semibold">
          {draft.analyzed
            ? draft.skills.length
              ? `נמצאו ${draft.skills.length} כישורים`
              : 'לא נמצאו כישורים מוכרים'
            : `${draft.skills.length} כישורים`}
          {draft.fileName && (
            <span className="font-normal text-muted">
              {' '}
              ב-<bdi>{draft.fileName}</bdi>
            </span>
          )}
        </h4>
        <p className="text-xs text-muted">
          בדוק/י את הרשימה: אפשר להסיר כישור שזוהה בטעות ולהוסיף כישור שלא זוהה.
        </p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="הכישורים שלי">
          {draft.skills.map((label) => (
            <li key={label}>
              <button
                type="button"
                onClick={() =>
                  onDraft({ ...draft, skills: draft.skills.filter((s) => s !== label) })
                }
                aria-label={`הסר את ${label}`}
                className="tap-44 inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-50 px-3 text-sm text-brand-900 dark:bg-brand-900/40 dark:text-brand-100"
              >
                <bdi>{label}</bdi>
                <CloseIcon className="shrink-0 text-xs opacity-70" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {others.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">הוספת כישור</span>
            <select
              value=""
              onChange={(e) => e.target.value && add(e.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">בחר/י…</option>
              {others.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor={yearsId} className="font-medium">
            שנות ניסיון
          </label>
          <input
            id={yearsId}
            type="number"
            inputMode="numeric"
            min={0}
            max={40}
            value={draft.yearsExperience}
            onChange={(e) =>
              onDraft({
                ...draft,
                yearsExperience: Math.max(0, Math.min(40, Math.round(Number(e.target.value) || 0))),
              })
            }
            className="min-h-11 w-24 rounded-xl border border-slate-300 bg-white px-3 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>

      {before.jobs > 0 && <Comparison before={before} after={after} beforeLabel={currentLabel} />}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} onClick={() => onSave(draft)}>
          שמור והשתמש בקורות החיים
        </button>
        <button type="button" className={SECONDARY} onClick={onCancel}>
          ביטול
        </button>
      </div>
    </div>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

/** "התאמה גבוהה (70 ומעלה)", the bracket kept on one line. ("70+" would show as "+70" in Hebrew.) */
function StrongLabel() {
  return (
    <>
      התאמה גבוהה <span className="whitespace-nowrap">({STRONG_MATCH} ומעלה)</span>
    </>
  );
}

function Comparison({
  before,
  after,
  beforeLabel,
}: {
  before: MatchSummary;
  after: MatchSummary;
  beforeLabel: string;
}) {
  const rows = [
    { key: 'average', label: 'ציון ממוצע', from: before.average, to: after.average },
    { key: 'strong', label: <StrongLabel />, from: before.strong, to: after.strong },
  ];
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
      <table className="w-full max-w-lg border-separate border-spacing-y-1 text-start tabular-nums">
        <caption className="mb-1 text-start font-semibold">
          מה ישתנה ב-{after.jobs} המשרות הפתוחות
        </caption>
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="text-start font-normal">
              <span className="sr-only">מדד</span>
            </th>
            <th scope="col" className="text-start font-normal">
              לפי {beforeLabel}
            </th>
            <th scope="col" className="text-start font-normal">
              לפי קורות החיים
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="text-start font-normal">
                {r.label}
              </th>
              <td>{r.from}</td>
              <td className="font-semibold">
                {/* Left-to-right, or a right-to-left line shows "(−3)" as "(3−)". */}
                {r.to}{' '}
                <bdi dir="ltr" className="text-xs font-normal text-muted">
                  ({signed(r.to - r.from)})
                </bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Saved({
  cv,
  scoring,
  jobs,
  compact,
  onEdit,
  onReplace,
  onDelete,
  onManage,
}: {
  cv: CvProfile;
  scoring: ScoringConfig;
  jobs: readonly Job[];
  compact: boolean;
  onEdit: () => void;
  onReplace: (file: File | undefined) => void;
  onDelete: () => void;
  onManage?: () => void;
}) {
  const summary = useMemo(() => matchSummary(jobs, cvProfile(scoring, cv)), [jobs, scoring, cv]);
  const tips = useMemo(
    () => missingSkills(jobs, new Set(cv.skills), compact ? 3 : 5),
    [jobs, cv, compact],
  );
  const facts = [
    cv.fileName,
    `נותחו ${formatDate(cv.analyzedAt)}`,
    `${cv.skills.length} כישורים`,
    cv.yearsExperience === 1 ? 'שנת ניסיון אחת' : `${cv.yearsExperience} שנות ניסיון`,
  ].filter(Boolean);

  return (
    <div className="mt-2 space-y-3">
      <p className="text-sm text-muted">
        {facts.map((f, i) => (
          <span key={i}>
            {i > 0 && ' · '}
            <bdi>{f}</bdi>
          </span>
        ))}
      </p>
      {cv.active ? (
        summary.jobs > 0 && (
          <p className="text-sm">
            ציון ממוצע <span className="font-semibold tabular-nums">{summary.average}</span> ·{' '}
            <span className="font-semibold tabular-nums">{summary.strong}</span> משרות עם{' '}
            <StrongLabel />
          </p>
        )
      ) : (
        <p className="text-sm">הציון מחושב עכשיו לפי הפרופיל הקבוע.</p>
      )}

      {!compact && (
        <ul className="flex flex-wrap gap-1.5" aria-label="הכישורים מקורות החיים">
          {cv.skills.map((label) => (
            <li
              key={label}
              className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-900 dark:bg-brand-900/40 dark:text-brand-100"
            >
              <bdi>{label}</bdi>
            </li>
          ))}
        </ul>
      )}

      {tips.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">משרות מבקשות, ולא מופיע בקורות החיים</h4>
          <ul className="mt-2 max-w-2xl space-y-2">
            {tips.map((t) => (
              <li
                key={t.label}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
              >
                <bdi className="truncate">{t.label}</bdi>
                <span
                  aria-hidden="true"
                  className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-slate-100 sm:col-span-1 sm:row-start-auto dark:bg-slate-800"
                >
                  <span
                    className="block h-full rounded-e-full bg-brand-600"
                    style={{ width: `${Math.max(t.share, 2)}%` }}
                  />
                </span>
                <span className="text-xs text-muted tabular-nums">
                  {t.share}% · {t.count} משרות
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            כדאי להוסיף לקורות החיים רק כישורים שבאמת יש לך.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {compact ? (
          onManage && (
            <button type="button" className={SECONDARY} onClick={onManage}>
              ניהול קורות החיים
            </button>
          )
        ) : (
          <>
            <label
              className={`${SECONDARY} relative cursor-pointer focus-within:ring-2 focus-within:ring-brand-600/40`}
            >
              החלף קובץ
              <input
                type="file"
                accept={CV_ACCEPT}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                onChange={(e) => {
                  onReplace(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <button type="button" className={SECONDARY} onClick={onEdit}>
              עריכת כישורים
            </button>
            <button
              type="button"
              className={`${LINK} ms-auto text-rose-700 dark:text-rose-400`}
              onClick={onDelete}
            >
              מחיקה
            </button>
          </>
        )}
      </div>
    </div>
  );
}
