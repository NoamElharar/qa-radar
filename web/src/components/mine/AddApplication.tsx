import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  applicationsTo,
  CHANNEL_SUGGESTIONS,
  createManualEntry,
  sameCompany,
  submitterOf,
  type ManualInput,
  type MineItem,
} from '../../lib/mine.ts';
import { formatDate } from '../../lib/time.ts';
import {
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_FORMATS,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  type InterviewFormat,
  type JobStatus,
  type StatusEntry,
} from '../../lib/storage.ts';
import { israelDayKey } from '../../lib/time.ts';
import { AlertIcon, PlusIcon } from '../icons.tsx';
import { NotesField } from './NotesField.tsx';

const STATUS_CHOICES: JobStatus[] = [
  'applied',
  'saved',
  'recruiter_call',
  'home_assignment',
  'interview_video',
  'interview_frontal',
  'awaiting_answer',
  'offer',
  'rejected',
];

const emptyForm = (): ManualInput => ({
  title: '',
  company: '',
  url: '',
  channel: '',
  endClient: '',
  status: 'applied',
  appliedDate: israelDayKey(new Date()),
  note: '',
  interviewFormat: 'unknown',
});

const inputClass =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

/** How many earlier applications to name in the warning. */
const EARLIER_LIST = 4;

/** "הוספת מועמדות ידנית" — for applications the collector never saw (LinkedIn, AllJobs, a friend…). */
export function AddApplication({
  onAdd,
  existing,
}: {
  onAdd: (id: string, entry: StatusEntry) => void;
  /** Applications already saved, to warn before a second agency sends my CV to the same company. */
  existing: MineItem[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ManualInput>(emptyForm);
  const [error, setError] = useState<string>();
  const [savedTitle, setSavedTitle] = useState<string>();
  const channelsId = useId();
  const earlier = useMemo(
    () => applicationsTo(existing, form.endClient ?? ''),
    [existing, form.endClient],
  );
  // Only a different sender clashes; the same agency coming back about the same company is fine.
  const company = form.company?.trim() ?? '';
  const clash = earlier.some((item) => {
    const by = submitterOf(item);
    return !company || !by || !sameCompany(by, company);
  });

  const set = (patch: Partial<ManualInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(undefined);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = createManualEntry(form, new Date());
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onAdd(result.id, result.entry);
    setSavedTitle(form.title.trim());
    setForm({ ...emptyForm(), channel: form.channel });
  };

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setSavedTitle(undefined);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-dashed border-brand-600 px-3 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-500 dark:text-brand-500 dark:hover:bg-brand-900/40"
        >
          <PlusIcon className="shrink-0" />
          הוספת מועמדות ידנית
        </button>
        {savedTitle && (
          <span role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
            ✓ נוסף: <bdi>{savedTitle}</bdi>
          </span>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-3 rounded-2xl border border-brand-200 bg-surface p-4 shadow-card dark:border-brand-800"
      aria-label="הוספת מועמדות ידנית"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">הוספת מועמדות ידנית</h3>
        <span className="text-xs text-muted">למשרות שהרדאר לא אסף</span>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">שם המשרה *</span>
        <input
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="לדוגמה: בודק/ת תוכנה ידני/ת"
          required
          autoFocus
          className={inputClass}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">חברה</span>
          <input
            value={form.company}
            onChange={(e) => set({ company: e.target.value })}
            placeholder="שם החברה או חברת ההשמה"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">איפה הגשתי</span>
          <input
            value={form.channel}
            onChange={(e) => set({ channel: e.target.value })}
            list={channelsId}
            placeholder="LinkedIn, AllJobs, חבר…"
            className={inputClass}
          />
          <datalist id={channelsId}>
            {CHANNEL_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="text-sm">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">
            לקוח הקצה — החברה שבה המשרה (אם המגייסת אמרה)
          </span>
          <input
            value={form.endClient}
            onChange={(e) => set({ endClient: e.target.value })}
            list="qa-radar-clients"
            placeholder="לדוגמה: אקמה"
            className={inputClass}
          />
        </label>
        {earlier.length > 0 && (
          <div
            role="status"
            className={`mt-2 rounded-lg border p-2.5 text-xs ${
              clash
                ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100'
                : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <p className="font-medium">
              {clash && <AlertIcon className="me-1 inline-block align-[-0.125em]" />}
              כבר יש לך{' '}
              {earlier.length === 1 ? 'מועמדות אחת' : `${earlier.length} מועמדויות`} ל-
              <bdi>{form.endClient?.trim()}</bdi>:
            </p>
            <ul className="mt-1 space-y-0.5">
              {earlier.slice(0, EARLIER_LIST).map((item) => (
                <li key={item.id}>
                  <bdi>{submitterOf(item) ?? 'לא ידוע מי הגיש'}</bdi> ·{' '}
                  {STATUS_LABELS[item.entry.status]}
                  {item.entry.appliedAt && ` · הוגש ${formatDate(item.entry.appliedAt)}`}
                </li>
              ))}
              {earlier.length > EARLIER_LIST && <li>ועוד {earlier.length - EARLIER_LIST}</li>}
            </ul>
            {clash && (
              <p className="mt-1.5">
                חברה שמקבלת את אותם קורות חיים מכמה חברות השמה עלולה לפסול את המועמדות. כדאי לברר מי
                הגיש ראשון לפני שמסכימים להגשה נוספת.
              </p>
            )}
          </div>
        )}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">קישור למשרה (לא חובה)</span>
        <input
          type="url"
          inputMode="url"
          dir="ltr"
          value={form.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="https://"
          className={`${inputClass} text-start`}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">סטטוס</span>
          <select
            value={form.status}
            onChange={(e) => set({ status: e.target.value as JobStatus })}
            className={inputClass}
          >
            {STATUS_CHOICES.map((s) => (
              <option key={s} value={s} title={STATUS_DESCRIPTIONS[s]}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">תאריך הגשה</span>
          <input
            type="date"
            value={form.appliedDate}
            onChange={(e) => set({ appliedDate: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">פורמט ראיון</span>
        <select
          value={form.interviewFormat ?? 'unknown'}
          onChange={(e) => set({ interviewFormat: e.target.value as InterviewFormat })}
          className={inputClass}
        >
          {INTERVIEW_FORMATS.map((f) => (
            <option key={f} value={f}>
              {INTERVIEW_FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">הערות</span>
        <NotesField
          value={form.note}
          onChange={(e) => set({ note: e.target.value })}
          minRows={2}
          placeholder="איש קשר, שלב בתהליך…"
          className="text-sm"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="min-h-11 flex-1 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          שמור מועמדות
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(undefined);
          }}
          className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm dark:border-slate-700"
        >
          {savedTitle ? 'סיום' : 'ביטול'}
        </button>
      </div>
      {savedTitle && (
        <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
          ✓ נוסף: <bdi>{savedTitle}</bdi> — אפשר להוסיף עוד אחת
        </p>
      )}
    </form>
  );
}
