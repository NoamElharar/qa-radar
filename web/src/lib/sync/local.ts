import {
  loadClocks,
  loadPersonal,
  saveClocks,
  savePersonal,
  type PersonalData,
} from '../storage.ts';
import {
  applyItems,
  changedKeys,
  clocksAfter,
  itemsOf,
  localItem,
  tick,
  type Item,
  type LocalState,
} from './model.ts';

/** This device's synced data and clocks, as stored now. */
export function readLocal(): LocalState {
  return { values: itemsOf(loadPersonal()), clocks: loadClocks() };
}

/**
 * Note when this device changed what (`before` → `after`, one update in this tab). Done on every
 * save, signed in or not, so the first sync knows which copy of each item is newer. Returns the
 * changed keys, for pushing.
 */
export function recordLocalChange(
  before: PersonalData,
  after: PersonalData,
  now = new Date().toISOString(),
): string[] {
  const keys = changedKeys(before, after);
  if (keys.length) saveClocks(tick(loadClocks(), keys, now));
  return keys;
}

/** This device's current version of the given items (values, or tombstones for deleted ones). */
export function localItems(keys: readonly string[]): Item[] {
  const local = readLocal();
  return keys.flatMap((key) => localItem(key, local) ?? []);
}

/** Store items that came from another device. Returns whether anything was applied. */
export function applyRemote(items: readonly Item[]): boolean {
  const { data, applied } = applyItems(loadPersonal(), items);
  if (!applied.length) return false;
  savePersonal(data);
  saveClocks(clocksAfter(loadClocks(), applied));
  return true;
}
