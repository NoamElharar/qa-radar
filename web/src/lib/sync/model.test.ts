import { describe, expect, it } from 'vitest';
import type { PersonalData, StatusEntry } from '../storage.ts';
import {
  applyItems,
  changedKeys,
  clocksAfter,
  fingerprint,
  itemsOf,
  reconcile,
  tick,
  winner,
  type Clocks,
  type Item,
} from './model.ts';

const empty = (): PersonalData => ({
  version: 1,
  statuses: {},
  hiddenCompanies: [],
  quickChecks: {},
});
const entry = (
  status: StatusEntry['status'],
  updatedAt: string,
  extra: Partial<StatusEntry> = {},
): StatusEntry => ({
  status,
  updatedAt,
  ...extra,
});
const T = (hour: number) => `2026-11-20T${String(hour).padStart(2, '0')}:00:00.000Z`;

describe('items', () => {
  it('flattens applications, hidden companies, "בדקתי" checks and the CV into keyed items', () => {
    const data: PersonalData = {
      ...empty(),
      statuses: { 'sqlink:1': entry('applied', T(9)) },
      hiddenCompanies: ['אקמה'],
      quickChecks: { linkedin: T(8) },
      lastVisitAt: T(7),
      cv: {
        skills: ['Playwright'],
        yearsExperience: 2,
        active: true,
        analyzedAt: T(6),
        updatedAt: T(6),
      },
    };
    expect([...itemsOf(data).keys()]).toEqual(['s:sqlink:1', 'h:אקמה', 'q:linkedin', 'cv']);
  });

  it('sees every kind of change, including a new position in "הסדר שלי" (which keeps updatedAt)', () => {
    const before: PersonalData = {
      ...empty(),
      statuses: { a: entry('applied', T(9)), b: entry('saved', T(9)) },
    };
    const after: PersonalData = {
      ...before,
      statuses: { a: { ...before.statuses.a!, order: 1024 } },
      hiddenCompanies: ['אקמה'],
      quickChecks: { linkedin: T(10) },
    };
    expect(changedKeys(before, after).sort()).toEqual(['h:אקמה', 'q:linkedin', 's:a', 's:b']);
  });

  it('ignores the order of fields — the same entry built differently is not a change', () => {
    const a = {
      ...empty(),
      statuses: { x: { status: 'applied', updatedAt: T(9), note: 'n' } as StatusEntry },
    };
    const b = {
      ...empty(),
      statuses: {
        x: { note: 'n', updatedAt: T(9), status: 'applied', pinned: undefined } as StatusEntry,
      },
    };
    expect(changedKeys(a, b)).toEqual([]);
    expect(fingerprint(a.statuses.x)).toBe(fingerprint(b.statuses.x));
  });

  it('records the change time of the changed keys only', () => {
    expect(tick({ 's:a': T(1), 's:b': T(1) }, ['s:b'], T(5))).toEqual({ 's:a': T(1), 's:b': T(5) });
  });
});

describe('which copy wins', () => {
  const item = (value: unknown, changedAt: string): Item => ({ key: 's:x', value, changedAt });

  it('keeps the newer change, whichever side it is on', () => {
    expect(winner(item(entry('applied', T(9)), T(9)), item(entry('rejected', T(10)), T(10)))).toBe(
      'remote',
    );
    expect(winner(item(entry('rejected', T(10)), T(10)), item(entry('applied', T(9)), T(9)))).toBe(
      'local',
    );
  });

  it('a deletion is a change like any other: the newer one wins', () => {
    expect(winner(item(entry('applied', T(9)), T(9)), item(null, T(10)))).toBe('remote');
    expect(winner(item(null, T(11)), item(entry('applied', T(10)), T(10)))).toBe('local');
  });

  it('the same content is "same" even when the times differ', () => {
    expect(winner(item(entry('applied', T(9)), T(9)), item(entry('applied', T(9)), T(12)))).toBe(
      'same',
    );
  });

  it('settles equal times by content, the same way on both devices', () => {
    const a = item(entry('applied', T(9)), T(10));
    const b = item(entry('rejected', T(9)), T(10));
    const onA = winner(a, b);
    const onB = winner(b, a);
    expect(onA).not.toBe('same');
    expect(onB).toBe(onA === 'local' ? 'remote' : 'local');
  });
});

describe('reconcile', () => {
  const state = (data: PersonalData, clocks: Clocks = {}) => ({ values: itemsOf(data), clocks });

  it('first link: what only the cloud has comes in, what only this device has goes up', () => {
    const local = state({
      ...empty(),
      statuses: { mine: entry('applied', T(9)) },
      hiddenCompanies: ['אקמה'],
    });
    const remote: Item[] = [{ key: 's:theirs', value: entry('saved', T(8)), changedAt: T(8) }];
    const { apply, push } = reconcile(local, remote, true);
    expect(apply.map((i) => i.key)).toEqual(['s:theirs']);
    expect(push.map((i) => i.key).sort()).toEqual(['h:אקמה', 's:mine']);
    // Data from before clocks existed is dated by its own last update.
    expect(push.find((i) => i.key === 's:mine')?.changedAt).toBe(T(9));
  });

  it('later updates only compare the items that changed', () => {
    const local = state({ ...empty(), statuses: { mine: entry('applied', T(9)) } });
    expect(reconcile(local, [], false)).toEqual({ apply: [], push: [] });
  });

  it("pushes this device's deletions too, so an old copy elsewhere can't bring the entry back", () => {
    const { push } = reconcile(state(empty(), { 's:gone': T(9) }), [], true);
    expect(push).toEqual([{ key: 's:gone', value: null, changedAt: T(9) }]);
  });
});

describe('applying remote items', () => {
  it('sets, deletes and skips what this version cannot read', () => {
    const data: PersonalData = {
      ...empty(),
      statuses: { a: entry('applied', T(9)), b: entry('saved', T(9)) },
      hiddenCompanies: ['x', 'y'],
    };
    const items: Item[] = [
      { key: 's:a', value: null, changedAt: T(10) },
      { key: 's:c', value: entry('recruiter_call', T(10)), changedAt: T(10) },
      { key: 's:bad', value: { status: 'no-such-status', updatedAt: T(10) }, changedAt: T(10) },
      { key: 'h:x', value: null, changedAt: T(10) },
      { key: 'h:z', value: true, changedAt: T(10) },
      { key: 'future:thing', value: 1, changedAt: T(10) },
    ];
    const { data: next, applied } = applyItems(data, items);
    expect(Object.keys(next.statuses).sort()).toEqual(['b', 'c']);
    expect(next.hiddenCompanies).toEqual(['y', 'z']);
    expect(applied.map((i) => i.key)).toEqual(['s:a', 's:c', 'h:x', 'h:z']);
    expect(clocksAfter({}, applied)).toEqual({
      's:a': T(10),
      's:c': T(10),
      'h:x': T(10),
      'h:z': T(10),
    });
  });

  it('removing the CV on one device removes it on the other', () => {
    const data: PersonalData = {
      ...empty(),
      cv: { skills: ['SQL'], yearsExperience: 1, active: true, analyzedAt: T(1), updatedAt: T(1) },
    };
    expect(applyItems(data, [{ key: 'cv', value: null, changedAt: T(2) }]).data.cv).toBeUndefined();
  });
});

/**
 * Two devices and the cloud, end to end through the same functions the app uses. The cloud
 * overwrites blindly (as Firestore does); devices settle conflicts by time.
 */
describe('two devices', () => {
  class Device {
    data = empty();
    clocks: Clocks = {};
    edit(change: (d: PersonalData) => PersonalData, now: string) {
      const after = change(this.data);
      this.clocks = tick(this.clocks, changedKeys(this.data, after), now);
      this.data = after;
    }
    /** Connect: look at everything in the cloud, take what's newer there, push what's newer here. */
    sync(cloud: Map<string, Item>) {
      for (let round = 0; round < 3; round++) {
        const { apply, push } = reconcile(
          { values: itemsOf(this.data), clocks: this.clocks },
          [...cloud.values()],
          true,
        );
        const { data, applied } = applyItems(this.data, apply);
        this.data = data;
        this.clocks = clocksAfter(this.clocks, applied);
        for (const item of push) cloud.set(item.key, item);
        if (!push.length && !apply.length) return;
      }
    }
  }
  const withStatus = (id: string, e: StatusEntry | undefined) => (d: PersonalData) => {
    const statuses = { ...d.statuses };
    if (e) statuses[id] = e;
    else delete statuses[id];
    return { ...d, statuses };
  };

  it('the later of two offline edits to the same application wins on both devices', () => {
    const cloud = new Map<string, Item>();
    const phone = new Device();
    const pc = new Device();
    phone.edit(withStatus('x', entry('applied', T(9))), T(9));
    phone.sync(cloud);
    pc.sync(cloud);
    // Both offline: the phone edits at 10, the PC at 11.
    phone.edit(withStatus('x', entry('recruiter_call', T(10))), T(10));
    pc.edit(withStatus('x', entry('rejected', T(11))), T(11));
    // The phone happens to reconnect last; its older edit must not win.
    pc.sync(cloud);
    phone.sync(cloud);
    pc.sync(cloud);
    expect(phone.data.statuses.x?.status).toBe('rejected');
    expect(pc.data.statuses.x?.status).toBe('rejected');
  });

  it('a deletion reaches a device that was offline, and stays deleted', () => {
    const cloud = new Map<string, Item>();
    const phone = new Device();
    const pc = new Device();
    pc.edit(withStatus('x', entry('applied', T(9))), T(9));
    pc.sync(cloud);
    phone.sync(cloud);
    pc.edit(withStatus('x', undefined), T(10));
    pc.sync(cloud);
    phone.sync(cloud);
    expect(phone.data.statuses.x).toBeUndefined();
    pc.sync(cloud);
    expect(pc.data.statuses.x).toBeUndefined();
  });

  it('a device with an old backup of the same data loses nothing and brings nothing back', () => {
    const cloud = new Map<string, Item>();
    const pc = new Device();
    pc.edit(withStatus('a', entry('applied', T(9))), T(9));
    pc.edit(withStatus('b', entry('saved', T(9))), T(9));
    pc.sync(cloud);
    pc.edit(withStatus('b', undefined), T(12));
    pc.edit(withStatus('a', entry('rejected', T(12))), T(12));
    pc.sync(cloud);
    // The phone imported a backup taken at 10 (no clocks — dated by the entries themselves).
    const phone = new Device();
    phone.data = {
      ...empty(),
      statuses: { a: entry('applied', T(9)), b: entry('saved', T(9)), c: entry('saved', T(10)) },
    };
    phone.sync(cloud);
    pc.sync(cloud);
    for (const d of [phone, pc]) {
      expect(Object.keys(d.data.statuses).sort()).toEqual(['a', 'c']);
      expect(d.data.statuses.a?.status).toBe('rejected');
    }
  });

  it('different applications edited on the two devices both survive', () => {
    const cloud = new Map<string, Item>();
    const phone = new Device();
    const pc = new Device();
    phone.edit(withStatus('from-phone', entry('applied', T(9))), T(9));
    pc.edit(withStatus('from-pc', entry('saved', T(9))), T(9));
    phone.edit((d) => ({ ...d, hiddenCompanies: ['אקמה'] }), T(9));
    phone.sync(cloud);
    pc.sync(cloud);
    phone.sync(cloud);
    for (const d of [phone, pc]) {
      expect(Object.keys(d.data.statuses).sort()).toEqual(['from-pc', 'from-phone']);
      expect(d.data.hiddenCompanies).toEqual(['אקמה']);
    }
  });
});
