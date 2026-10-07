import { useId, useState, type FormEvent } from 'react';
import { CHANNEL_SUGGESTIONS, createManualEntry, type ManualInput } from '../../lib/mine.ts';
import { STATUS_LABELS, type JobStatus, type StatusEntry } from '../../lib/storage.ts';
import { israelDayKey } from '../../lib/time.ts';

const STATUS_CHOICES: JobStatus[] = ['applied', 'saved', 'interview', 'offer', 'rejected'];

const emptyForm = (): ManualInput => ({
  title: '',
  company: '',
  url: '',
  channel: '',
  status: 'applied',
  appliedDate: israelDayKey(new Date()),
  note: '',
});

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

/** "➕ הוספת מועמדות" — for applications the collector never saw (LinkedIn, AllJobs, a friend…). */
export function AddApplication({ onAdd }: { onAdd: (id: string, entry: StatusEntry) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ManualInput>(emptyForm);
  const [error, setError] = useState<string>();
  const [savedTitle, setSavedTitle] = useState<string>();
  const channelsId = useId();

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
          ➕ הוספת מועמדות ידנית
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
      className="space-y-3 rounded-2xl border border-brand-200 bg-white p-4 dark:border-brand-800 dark:bg-slate-900"
      aria-label="הוספת מועמדות ידנית"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">הוספת מועמדות ידנית</h3>
        <span className="text-xs text-slate-500">למשרות שהרדאר לא אסף</span>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">שם המשרה *</span>
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
          <span className="mb-1 block text-xs text-slate-500">חברה</span>
          <input
            value={form.company}
            onChange={(e) => set({ company: e.target.value })}
            placeholder="שם החברה או חברת ההשמה"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">איפה הגשתי</span>
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

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">קישור למשרה (לא חובה)</span>
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
          <span className="mb-1 block text-xs text-slate-500">סטטוס</span>
          <select
            value={form.status}
            onChange={(e) => set({ status: e.target.value as JobStatus })}
            className={inputClass}
          >
            {STATUS_CHOICES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">תאריך הגשה</span>
          <input
            type="date"
            value={form.appliedDate}
            onChange={(e) => set({ appliedDate: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">הערות</span>
        <textarea
          value={form.note}
          onChange={(e) => set({ note: e.target.value })}
          rows={2}
          placeholder="איש קשר, שלב בתהליך…"
          className={inputClass}
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
