/**
 * Personal state lives only in this browser (localStorage). Nothing here is ever sent anywhere.
 * Every access is wrapped: private windows or blocked storage must not break the dashboard.
 */

export type JobStatus = 'viewed' | 'saved' | 'applied' | 'interview' | 'offer' | 'rejected' | 'irrelevant';

export const STATUS_LABELS: Record<JobStatus | 'new', string> = {
  new: 'חדש',
  viewed: 'נצפה',
  saved: 'שמור',
  applied: 'הגשתי',
  interview: 'ראיון',
  offer: 'הצעה',
  rejected: 'נדחה',
  irrelevant: 'לא רלוונטי',
};

/** Order used by the status menu and the "המועמדויות שלי" view. */
export const STATUS_ORDER: JobStatus[] = ['saved', 'applied', 'interview', 'offer', 'rejected', 'irrelevant', 'viewed'];

/** Statuses hidden by "הסתר משרות שטיפלתי בהן". */
export const HANDLED_STATUSES: ReadonlySet<JobStatus> = new Set(['applied', 'interview', 'offer', 'rejected', 'irrelevant']);

export interface StatusEntry {
  status: JobStatus;
  note?: string;
  appliedAt?: string;
  updatedAt: string;
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
  for (const [id, entry] of Object.entries(incoming.statuses ?? {})) {
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
