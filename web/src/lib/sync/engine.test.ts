import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadPersonal,
  loadSyncDevice,
  savePersonal,
  type PersonalData,
  type StatusEntry,
} from '../storage.ts';
import type { RemoteSnapshot, SyncBackend, SyncUser } from './backend.ts';
import { SyncEngine, type SyncState } from './engine.ts';
import { recordLocalChange } from './local.ts';
import type { Item } from './model.ts';

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key = (i: number) => [...this.map.keys()][i] ?? null;
  getItem = (k: string) => this.map.get(k) ?? null;
  setItem = (k: string, v: string) => void this.map.set(k, String(v));
  removeItem = (k: string) => void this.map.delete(k);
  clear = () => this.map.clear();
}

/** The cloud and its sign-in, in memory. `offline` holds the server back, as a dead connection would. */
class FakeCloud {
  docs = new Map<string, Item>();
  user: SyncUser | null = null;
  offline = false;
  failWrites?: { code: string };
  private userCallbacks = new Set<(u: SyncUser | null) => void>();
  private listeners = new Set<(s: RemoteSnapshot) => void>();

  backend: SyncBackend = {
    onUser: (cb) => {
      this.userCallbacks.add(cb);
      queueMicrotask(() => cb(this.user));
      return () => this.userCallbacks.delete(cb);
    },
    signIn: async () => this.setUser({ uid: 'u1', email: 'me@example.com' }),
    signOut: async () => this.setUser(null),
    listen: (_uid, onNext) => {
      this.listeners.add(onNext);
      queueMicrotask(() => onNext(this.snapshot([], this.offline)));
      return () => this.listeners.delete(onNext);
    },
    write: async (_uid, items) => {
      if (this.failWrites) throw this.failWrites;
      for (const item of items) this.docs.set(item.key, item);
      this.emit(items);
    },
  };

  setUser(user: SyncUser | null) {
    this.user = user;
    for (const cb of this.userCallbacks) cb(user);
  }
  snapshot(changes: readonly Item[], fromCache = false): RemoteSnapshot {
    return { all: () => [...this.docs.values()], changes: [...changes], fromCache, pendingWrites: false };
  }
  emit(changes: readonly Item[], fromCache = false) {
    for (const l of this.listeners) l(this.snapshot(changes, fromCache));
  }
  /** Another device writes. */
  remoteWrite(items: Item[]) {
    for (const item of items) this.docs.set(item.key, item);
    this.emit(items);
  }
}

const entry = (status: StatusEntry['status'], updatedAt: string): StatusEntry => ({
  status,
  updatedAt,
});
const T = (hour: number) => `2026-11-20T${String(hour).padStart(2, '0')}:00:00.000Z`;
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('SyncEngine', () => {
  let cloud: FakeCloud;
  let states: SyncState[];
  let remoteChanges: number;
  let engine: SyncEngine;

  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    cloud = new FakeCloud();
    states = [];
    remoteChanges = 0;
    engine = new SyncEngine(cloud.backend, {
      onRemote: () => remoteChanges++,
      onState: (s) => states.push(s),
    });
  });
  const last = () => states.at(-1)!;
  const save = (data: Partial<PersonalData>) => savePersonal({ ...loadPersonal(), ...data });

  it('first sign-in: keeps a backup, then merges both ways', async () => {
    save({ statuses: { mine: entry('applied', T(9)) } });
    cloud.docs.set('s:theirs', { key: 's:theirs', value: entry('saved', T(8)), changedAt: T(8) });
    engine.start();
    await settle();
    expect(last()).toEqual({ kind: 'signed-out' });
    await engine.signIn();
    await settle();
    expect(Object.keys(loadPersonal().statuses).sort()).toEqual(['mine', 'theirs']);
    expect([...cloud.docs.keys()].sort()).toEqual(['s:mine', 's:theirs']);
    expect(remoteChanges).toBe(1);
    expect(last()).toMatchObject({ kind: 'synced', email: 'me@example.com' });
    expect(loadSyncDevice()).toMatchObject({ linked: true, email: 'me@example.com' });
    const backup = JSON.parse(localStorage.getItem('qa-radar:pre-sync-backup')!) as {
      uid: string;
      backup: string;
    };
    expect(backup.uid).toBe('u1');
    expect(Object.keys((JSON.parse(backup.backup) as PersonalData).statuses)).toEqual(['mine']);
  });

  it('offline at first: waits for the server before comparing or pushing anything', async () => {
    save({ statuses: { mine: entry('applied', T(9)) } });
    cloud.offline = true;
    cloud.user = { uid: 'u1' };
    engine.start();
    await settle();
    await settle();
    expect(last()).toEqual({ kind: 'offline', email: undefined });
    expect(cloud.docs.size).toBe(0);
    cloud.offline = false;
    cloud.emit([]);
    await settle();
    expect([...cloud.docs.keys()]).toEqual(['s:mine']);
    expect(last().kind).toBe('synced');
  });

  it("pushes this device's later changes, and applies other devices' changes", async () => {
    cloud.user = { uid: 'u1' };
    engine.start();
    await settle();
    await settle();
    const before = loadPersonal();
    const after = { ...before, statuses: { x: entry('recruiter_call', T(10)) } };
    savePersonal(after);
    engine.push(recordLocalChange(before, after, T(10)));
    await settle();
    expect(cloud.docs.get('s:x')).toMatchObject({
      changedAt: T(10),
      value: { status: 'recruiter_call' },
    });

    cloud.remoteWrite([{ key: 's:x', value: entry('rejected', T(11)), changedAt: T(11) }]);
    await settle();
    expect(loadPersonal().statuses.x?.status).toBe('rejected');
    expect(remoteChanges).toBe(1);

    // An older change arriving late doesn't win: this device sends its newer copy back.
    cloud.remoteWrite([{ key: 's:x', value: entry('applied', T(9)), changedAt: T(9) }]);
    await settle();
    expect(loadPersonal().statuses.x?.status).toBe('rejected');
    expect(cloud.docs.get('s:x')?.changedAt).toBe(T(11));
  });

  it('reports a write the rules refuse, and starts over on "ניסיון נוסף"', async () => {
    save({ statuses: { mine: entry('applied', T(9)) } });
    cloud.user = { uid: 'u1' };
    cloud.failWrites = { code: 'permission-denied' };
    engine.start();
    await settle();
    await settle();
    expect(last()).toMatchObject({ kind: 'error', message: expect.stringContaining('אין הרשאה') });
    cloud.failWrites = undefined;
    engine.retry();
    await settle();
    await settle();
    expect(cloud.docs.has('s:mine')).toBe(true);
    expect(last().kind).toBe('synced');
  });

  it('a closed sign-in window is not an error', async () => {
    cloud.backend.signIn = async () => {
      throw { code: 'auth/popup-closed-by-user' };
    };
    engine.start();
    await engine.signIn();
    expect(last()).toEqual({ kind: 'signed-out', message: undefined });
  });

  it('disconnecting this device keeps its data', async () => {
    save({ statuses: { mine: entry('applied', T(9)) } });
    cloud.user = { uid: 'u1' };
    engine.start();
    await settle();
    await settle();
    await engine.signOut();
    expect(last()).toEqual({ kind: 'signed-out' });
    expect(loadSyncDevice().linked).toBe(false);
    expect(Object.keys(loadPersonal().statuses)).toEqual(['mine']);
  });
});
