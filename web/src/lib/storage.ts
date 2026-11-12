/**
 * Personal state lives only in this browser (localStorage). Nothing here is ever sent anywhere.
 * Every access is wrapped: private windows or blocked storage must not break the dashboard.
 */

export type JobStatus =
  | 'viewed'
  | 'saved'
  | 'applied'
  | 'recruiter_call'
  | 'home_assignment'
  /** Legacy (before the split into video / frontal): kept so older entries stay readable; not offered. */
  | 'interview'
  | 'interview_video'
  | 'interview_frontal'
  | 'awaiting_answer'
  | 'offer'
  | 'rejected'
  | 'irrelevant';

export const STATUS_LABELS: Record<JobStatus | 'new', string> = {
  new: 'חדש',
  viewed: 'נצפה',
  saved: 'שמור',
  applied: 'הגשתי',
  recruiter_call: 'שיחה ממגייסת',
  home_assignment: 'עבודת בית',
  interview: 'ראיון',
  interview_video: 'ראיון שיחת וידאו',
  interview_frontal: 'ראיון פרונטלי',
  awaiting_answer: 'ממתין לתשובה',
  offer: 'הצעה',
  rejected: 'נדחה',
  irrelevant: 'לא רלוונטי',
};

/** What a status means — shown as a tooltip wherever a status is picked or listed. */
export const STATUS_DESCRIPTIONS: Partial<Record<JobStatus, string>> = {
  recruiter_call:
    'שיחת סינון טלפונית קצרה עם מגייסת מחברת השמה, שבה שואלים על הרקע והניסיון שלי לפני שמעבירים את קורות החיים למעסיקים.',
  home_assignment: 'החברה שלחה לי עבודת בית להכין לפני הראיון.',
  interview_video: 'ראיון בשיחת וידאו (Zoom / Teams / Google Meet) — לרוב השלב הראשון מול החברה.',
  interview_frontal: 'ראיון פנים אל פנים במשרדי החברה — לרוב השלב שאחרי ראיון הווידאו.',
  awaiting_answer: 'סיימתי את הראיונות ומחכה לתשובה — בין אם אעבור ובין אם לא.',
  interview: 'ראיון שעוד לא סווג — כדאי לבחור "ראיון שיחת וידאו" או "ראיון פרונטלי".',
};

/** Every status in pipeline order, including legacy ones (counts, filters, URLs). */
export const ALL_STATUSES: JobStatus[] = [
  'saved',
  'applied',
  'recruiter_call',
  'home_assignment',
  'interview',
  'interview_video',
  'interview_frontal',
  'awaiting_answer',
  'offer',
  'rejected',
  'irrelevant',
  'viewed',
];

/** Statuses that still read correctly on old entries but are no longer offered as a choice. */
export const LEGACY_STATUSES: ReadonlySet<JobStatus> = new Set(['interview']);

/** The statuses offered in the job-card menu and on "המועמדויות שלי". */
export const STATUS_ORDER: JobStatus[] = ALL_STATUSES.filter((s) => !LEGACY_STATUSES.has(s));

/** Statuses hidden by "הסתר משרות שטיפלתי בהן". */
export const HANDLED_STATUSES: ReadonlySet<JobStatus> = new Set([
  'applied',
  'recruiter_call',
  'home_assignment',
  'interview',
  'interview_video',
  'interview_frontal',
  'awaiting_answer',
  'offer',
  'rejected',
  'irrelevant',
]);

/** How an interview takes place. Entries saved before this field existed count as "לא ידוע". */
export type InterviewFormat = 'zoom' | 'teams' | 'meet' | 'frontal' | 'unknown';

export const INTERVIEW_FORMATS: InterviewFormat[] = ['zoom', 'teams', 'meet', 'frontal', 'unknown'];

export const INTERVIEW_FORMAT_LABELS: Record<InterviewFormat, string> = {
  zoom: 'Zoom',
  teams: 'Teams',
  meet: 'Google Meet',
  frontal: 'פרונטלי',
  unknown: 'לא ידוע',
};

const isInterviewFormat = (v: unknown): v is InterviewFormat =>
  INTERVIEW_FORMATS.includes(v as InterviewFormat);

/** The entry's interview format; missing or unrecognized values read as "לא ידוע". */
export function interviewFormatOf(entry: Pick<StatusEntry, 'interviewFormat'>): InterviewFormat {
  return isInterviewFormat(entry.interviewFormat) ? entry.interviewFormat : 'unknown';
}

export interface StatusEntry {
  status: JobStatus;
  note?: string;
  appliedAt?: string;
  updatedAt: string;
  /** Pinned entries are shown first in "המועמדויות שלי". */
  pinned?: boolean;
  pinnedAt?: string;
  /** Added by hand for a job the collector never saw (id starts with "manual:"). */
  manual?: boolean;
  /** Where I applied, e.g. "LinkedIn", "AllJobs", "חבר מביא חבר". */
  channel?: string;
  /**
   * The company the job is really at, when an agency recruits for it ("אקמה"). Two agencies sending
   * my CV to the same company can cost the application, so "שלי" warns about it.
   */
  endClient?: string;
  /** Optional; missing means "לא ידוע" (and is how entries from before this field read). */
  interviewFormat?: InterviewFormat;
  /** Snapshot so the entry stays readable after the job leaves jobs.json. */
  snapshot?: { title: string; company?: string; url: string };
  /**
   * Every status the application went through, oldest first; the last step is the current status.
   * Entries from before this field read a history rebuilt from their dates (see historyOf).
   */
  history?: StatusStep[];
}

/** One step of an application ("שיחה ממגייסת" on 5.11). */
export interface StatusStep {
  status: JobStatus;
  at: string;
  /** The date is a guess (rebuilt from an older entry), not the day the status was set. */
  estimated?: true;
}

/** "נצפה" is set automatically when a posting is opened, so it is not a step of the process. */
const isStepStatus = (s: JobStatus) => s !== 'viewed';

const isStep = (v: unknown): v is StatusStep => {
  const s = v as StatusStep;
  return (
    typeof s === 'object' &&
    s !== null &&
    ALL_STATUSES.includes(s.status) &&
    typeof s.at === 'string' &&
    !Number.isNaN(Date.parse(s.at))
  );
};

/** Drops repeated steps (the same status twice in a row keeps the first date). */
function collapse(steps: StatusStep[]): StatusStep[] {
  return steps.filter((step, i) => i === 0 || step.status !== steps[i - 1]!.status);
}

/**
 * The application's steps, oldest first, ending with its current status. Entries saved before
 * history existed get one rebuilt from their dates: "הגשתי" on the application date, then the
 * current status on the last update (marked as a guess, since any edit moves that date).
 */
export function historyOf(entry: StatusEntry): StatusStep[] {
  let steps = (entry.history ?? []).filter((s) => isStep(s) && isStepStatus(s.status));
  if (!steps.length && entry.appliedAt && entry.status !== 'saved') {
    steps = [{ status: 'applied', at: entry.appliedAt }];
  }
  // The application date lives in appliedAt (the "תאריך הגשה" field); the "הגשתי" step follows it.
  const applied = steps.findIndex((s) => s.status === 'applied');
  if (entry.appliedAt && applied >= 0) {
    steps = steps.map((s, i) => (i === applied ? { status: 'applied', at: entry.appliedAt! } : s));
  }
  const last = steps[steps.length - 1];
  if (isStepStatus(entry.status) && last?.status !== entry.status) {
    // Never before the step it follows.
    const at = last && entry.updatedAt < last.at ? last.at : entry.updatedAt;
    steps = [...steps, { status: entry.status, at, estimated: true }];
  }
  return collapse(steps);
}

/** The entry with `status` set as of `at`, appended to its history when it is a new step. */
export function withStatus(prev: StatusEntry | undefined, status: JobStatus, at: string): StatusEntry {
  const base: StatusEntry = prev ?? { status, updatedAt: at };
  const steps = prev ? historyOf(prev) : [];
  const history =
    isStepStatus(status) && steps[steps.length - 1]?.status !== status
      ? [...steps, { status, at }]
      : steps;
  return {
    ...base,
    status,
    updatedAt: at,
    appliedAt: status === 'applied' && !base.appliedAt ? at : base.appliedAt,
    ...(history.length ? { history } : {}),
  };
}

/**
 * The history with one step's date changed, kept between its neighbours so the order stays true.
 * Changing the "הגשתי" step also moves the application date (they are the same day).
 */
export function withStepDate(entry: StatusEntry, index: number, day: string): Partial<StatusEntry> {
  const steps = historyOf(entry);
  const step = steps[index];
  if (!step || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return {};
  let at = new Date(`${day}T12:00:00`).toISOString();
  const before = steps[index - 1]?.at;
  const after = steps[index + 1]?.at;
  if (before && at < before) at = before;
  if (after && at > after) at = after;
  const history = steps.map((s, i) => (i === index ? { status: s.status, at } : s));
  const firstApplied = steps.findIndex((s) => s.status === 'applied');
  return { history, ...(index === firstApplied ? { appliedAt: at } : {}) };
}

/** The history without one earlier step (a status picked by mistake). The current status stays. */
export function withoutStep(entry: StatusEntry, index: number): Partial<StatusEntry> {
  const steps = historyOf(entry);
  if (index < 0 || index >= steps.length - 1) return {};
  return { history: collapse(steps.filter((_, i) => i !== index)) };
}

/** Merges the histories of entries that belong to one job (a source re-published it under new ids). */
export function mergeHistories(entries: StatusEntry[]): StatusStep[] {
  const all = entries.flatMap(historyOf).sort((a, b) => a.at.localeCompare(b.at));
  return collapse(all);
}

export interface PersonalData {
  version: 1;
  statuses: Record<string, StatusEntry>;
  hiddenCompanies: string[];
  quickChecks: Record<string, string>;
  lastVisitAt?: string;
}

const KEYS = {
  statuses: 'qa-radar:statuses',
  hidden: 'qa-radar:hidden-companies',
  quick: 'qa-radar:quick-checks',
  lastVisit: 'qa-radar:last-visit',
  theme: 'qa-radar:theme',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    /* storage unavailable — keep working in memory */
  }
}

export function loadPersonal(): PersonalData {
  let lastVisitAt: string | undefined;
  try {
    lastVisitAt = localStorage.getItem(KEYS.lastVisit) ?? undefined;
  } catch {
    lastVisitAt = undefined;
  }
  return {
    version: 1,
    statuses: read(KEYS.statuses, {}),
    hiddenCompanies: read(KEYS.hidden, []),
    quickChecks: read(KEYS.quick, {}),
    lastVisitAt,
  };
}

export function savePersonal(data: PersonalData): void {
  write(KEYS.statuses, data.statuses);
  write(KEYS.hidden, data.hiddenCompanies);
  write(KEYS.quick, data.quickChecks);
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Apply the keys that changed between `before` and `after` (set or removed) onto `base`. */
function applyChanges<T>(before: Record<string, T>, after: Record<string, T>, base: Record<string, T>): Record<string, T> {
  const result = { ...base };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue;
    if (after[key] === undefined) delete result[key];
    else result[key] = after[key];
  }
  return result;
}

/**
 * A tab's update (`before` → `after`) applied on top of what is stored now, so it keeps whatever
 * another open tab saved in the meantime — instead of writing back this tab's older copy of everything.
 */
export function mergePersonalChanges(before: PersonalData, after: PersonalData, stored: PersonalData): PersonalData {
  const added = after.hiddenCompanies.filter((name) => !before.hiddenCompanies.includes(name));
  const removed = new Set(before.hiddenCompanies.filter((name) => !after.hiddenCompanies.includes(name)));
  return {
    ...after,
    statuses: applyChanges(before.statuses, after.statuses, stored.statuses),
    hiddenCompanies: [...new Set([...stored.hiddenCompanies, ...added])].filter((name) => !removed.has(name)),
    quickChecks: applyChanges(before.quickChecks, after.quickChecks, stored.quickChecks),
  };
}

function storageReadable(): boolean {
  try {
    localStorage.getItem(KEYS.statuses);
    return true;
  } catch {
    return false;
  }
}

/** Save one update without erasing another tab's changes. Returns the data to show. */
export function savePersonalChanges(before: PersonalData, after: PersonalData): PersonalData {
  // Without storage there is no other tab to merge with — keep working in memory.
  if (!storageReadable()) return after;
  const merged = mergePersonalChanges(before, after, loadPersonal());
  savePersonal(merged);
  return merged;
}

/** The stored data when another tab changed it, else `current` itself (so nothing re-renders). */
export function refreshPersonal(current: PersonalData): PersonalData {
  if (!storageReadable()) return current;
  const stored = loadPersonal();
  const unchanged =
    same(stored.statuses, current.statuses) &&
    same(stored.hiddenCompanies, current.hiddenCompanies) &&
    same(stored.quickChecks, current.quickChecks);
  return unchanged ? current : { ...stored, lastVisitAt: current.lastVisitAt };
}

export function saveLastVisit(iso: string): void {
  write(KEYS.lastVisit, iso);
}

export type ThemePreference = 'system' | 'light' | 'dark';

export function loadTheme(): ThemePreference {
  try {
    const t = localStorage.getItem(KEYS.theme);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function saveTheme(theme: ThemePreference): void {
  write(KEYS.theme, theme);
}

/** JSON backup of everything personal (statuses, notes, hidden companies, checks). */
export function exportPersonal(data: PersonalData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString(), app: 'qa-radar' }, null, 2);
}

/** Merge a backup into the current data. Newer status entries win; lists are unioned. */
export function importPersonal(current: PersonalData, json: string): PersonalData {
  const incoming = JSON.parse(json) as Partial<PersonalData> & { app?: string };
  if (incoming.app !== 'qa-radar' || typeof incoming.statuses !== 'object') {
    throw new Error('זה לא קובץ גיבוי של רדאר משרות QA');
  }
  const statuses = { ...current.statuses };
  for (const [id, raw] of Object.entries(incoming.statuses ?? {})) {
    // Older backups have no interviewFormat, endClient or history; values this version can't read are dropped.
    const { interviewFormat, endClient, history, ...rest } = raw;
    const steps = Array.isArray(history)
      ? collapse(
          history
            .filter(isStep)
            .filter((s) => isStepStatus(s.status))
            .map((s) => ({ status: s.status, at: s.at, ...(s.estimated === true ? { estimated: true as const } : {}) })),
        )
      : [];
    const entry: StatusEntry = {
      ...rest,
      ...(isInterviewFormat(interviewFormat) ? { interviewFormat } : {}),
      ...(typeof endClient === 'string' && endClient.trim() ? { endClient: endClient.trim() } : {}),
      ...(steps.length ? { history: steps } : {}),
    };
    const existing = statuses[id];
    if (!existing || entry.updatedAt > existing.updatedAt) statuses[id] = entry;
  }
  return {
    ...current,
    statuses,
    hiddenCompanies: [...new Set([...current.hiddenCompanies, ...(incoming.hiddenCompanies ?? [])])],
    quickChecks: { ...(incoming.quickChecks ?? {}), ...current.quickChecks },
  };
}
