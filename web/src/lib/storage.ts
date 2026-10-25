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
  /** Optional; missing means "לא ידוע" (and is how entries from before this field read). */
  interviewFormat?: InterviewFormat;
  /** Snapshot so the entry stays readable after the job leaves jobs.json. */
  snapshot?: { title: string; company?: string; url: string };
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
    // Older backups have no interviewFormat; a value this version doesn't know is dropped.
    const { interviewFormat, ...rest } = raw;
    const entry: StatusEntry = isInterviewFormat(interviewFormat) ? { ...rest, interviewFormat } : rest;
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
