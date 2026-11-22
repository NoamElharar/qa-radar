import { sanitizeCv, sanitizeEntry, type PersonalData } from '../storage.ts';

/**
 * Sync between devices, as pure functions. Everything in "שלי" that should follow me between
 * devices is flattened into keyed items, so two devices editing different things never collide:
 *
 *   s:<jobId>     one application (StatusEntry)
 *   h:<company>   a hidden company (value `true`)
 *   q:<sourceId>  the last "בדקתי" of a link-out source (ISO date)
 *   cv            the CV skills (CvProfile)
 *
 * Every item carries `changedAt`, the time of its last change on whichever device made it. A
 * deleted item stays as a tombstone (`value: null`), so a device that was offline can't bring it
 * back. When two devices disagree, the newer change wins. Theme and "last visit" stay per device.
 */

export interface Item {
  key: string;
  /** `null`: deleted at `changedAt`. */
  value: unknown;
  changedAt: string;
}

/** Last change time per item key on this device. A key with a clock but no value was deleted then. */
export type Clocks = Record<string, string>;

export interface LocalState {
  values: Map<string, unknown>;
  clocks: Clocks;
}

const EPOCH = '1970-01-01T00:00:00.000Z';

/** The synced parts of the personal data as keyed values. */
export function itemsOf(data: PersonalData): Map<string, unknown> {
  const values = new Map<string, unknown>();
  for (const [id, entry] of Object.entries(data.statuses)) values.set(`s:${id}`, entry);
  for (const name of data.hiddenCompanies) values.set(`h:${name}`, true);
  for (const [id, at] of Object.entries(data.quickChecks)) values.set(`q:${id}`, at);
  if (data.cv) values.set('cv', data.cv);
  return values;
}

/** JSON with sorted keys, so the same value gives the same text on every device. */
export function fingerprint(value: unknown): string {
  return (
    JSON.stringify(value, (_key, v: unknown) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : v,
    ) ?? 'null'
  );
}

/** Keys whose value was added, changed or removed between two versions of the data. */
export function changedKeys(before: PersonalData, after: PersonalData): string[] {
  const a = itemsOf(before);
  const b = itemsOf(after);
  return [...new Set([...a.keys(), ...b.keys()])].filter(
    (key) => fingerprint(a.get(key) ?? null) !== fingerprint(b.get(key) ?? null),
  );
}

/** The clocks with `keys` changed at `now`. */
export function tick(clocks: Clocks, keys: readonly string[], now: string): Clocks {
  if (!keys.length) return clocks;
  const next = { ...clocks };
  for (const key of keys) next[key] = now;
  return next;
}

/** When an item last changed, for data saved before clocks existed. */
function fallbackTime(key: string, value: unknown): string {
  const v = value as { updatedAt?: unknown; pinnedAt?: unknown };
  if (key.startsWith('s:')) {
    const times = [v.updatedAt, v.pinnedAt].filter((t): t is string => typeof t === 'string');
    return times.sort().at(-1) ?? EPOCH;
  }
  if (key.startsWith('q:') && typeof value === 'string') return value;
  if (key === 'cv' && typeof v.updatedAt === 'string') return v.updatedAt;
  return EPOCH;
}

/** This device's version of one item: its value, a tombstone, or nothing at all. */
export function localItem(key: string, local: LocalState): Item | undefined {
  const clock = local.clocks[key];
  if (local.values.has(key)) {
    const value = local.values.get(key);
    return { key, value, changedAt: clock ?? fallbackTime(key, value) };
  }
  return clock ? { key, value: null, changedAt: clock } : undefined;
}

/**
 * Which copy of an item to keep. The newer change wins; equal times (rare) are settled by the
 * content itself, so every device picks the same one and they can't keep overwriting each other.
 */
export function winner(
  local: Item | undefined,
  remote: Item | undefined,
): 'local' | 'remote' | 'same' {
  if (!remote) return local ? 'local' : 'same';
  if (!local) return 'remote';
  const a = fingerprint(local.value);
  const b = fingerprint(remote.value);
  if (a === b) return 'same';
  if (local.changedAt !== remote.changedAt)
    return local.changedAt > remote.changedAt ? 'local' : 'remote';
  return a > b ? 'local' : 'remote';
}

/**
 * Compare remote items with this device's. `full`: `remote` is everything the cloud holds (the first
 * look after connecting), so whatever only this device has is pushed too.
 */
export function reconcile(
  local: LocalState,
  remote: readonly Item[],
  full: boolean,
): { apply: Item[]; push: Item[] } {
  const apply: Item[] = [];
  const push: Item[] = [];
  const seen = new Set<string>();
  for (const item of remote) {
    seen.add(item.key);
    const mine = localItem(item.key, local);
    const side = winner(mine, item);
    if (side === 'remote') apply.push(item);
    else if (side === 'local') push.push(mine!);
  }
  if (full) {
    for (const key of new Set([...local.values.keys(), ...Object.keys(local.clocks)])) {
      if (seen.has(key)) continue;
      const mine = localItem(key, local);
      if (mine) push.push(mine);
    }
  }
  return { apply, push };
}

/**
 * The personal data with remote items applied, and the items that were. Values this version can't
 * read (or keys from a newer version of the app) are left out of both.
 */
export function applyItems(
  data: PersonalData,
  items: readonly Item[],
): { data: PersonalData; applied: Item[] } {
  const statuses = { ...data.statuses };
  const quickChecks = { ...data.quickChecks };
  const hidden = new Set(data.hiddenCompanies);
  let cv = data.cv;
  const applied: Item[] = [];
  for (const item of items) {
    const { key, value } = item;
    if (key.startsWith('s:')) {
      const entry = value === null ? undefined : sanitizeEntry(value);
      if (value === null) delete statuses[key.slice(2)];
      else if (entry) statuses[key.slice(2)] = entry;
      else continue;
    } else if (key.startsWith('h:')) {
      if (value === null) hidden.delete(key.slice(2));
      else hidden.add(key.slice(2));
    } else if (key.startsWith('q:')) {
      if (value === null) delete quickChecks[key.slice(2)];
      else if (typeof value === 'string' && !Number.isNaN(Date.parse(value)))
        quickChecks[key.slice(2)] = value;
      else continue;
    } else if (key === 'cv') {
      const next = value === null ? undefined : sanitizeCv(value);
      if (value !== null && !next) continue;
      cv = next;
    } else continue;
    applied.push(item);
  }
  // Keep the existing order; companies hidden on another device go last.
  const hiddenCompanies = [
    ...data.hiddenCompanies.filter((n) => hidden.has(n)),
    ...[...hidden].filter((n) => !data.hiddenCompanies.includes(n)),
  ];
  return { data: { ...data, statuses, quickChecks, hiddenCompanies, cv }, applied };
}

/** The clocks after applying remote items: each takes the time of the change it brings. */
export function clocksAfter(clocks: Clocks, items: readonly Item[]): Clocks {
  const next = { ...clocks };
  for (const item of items) next[item.key] = item.changedAt;
  return next;
}
