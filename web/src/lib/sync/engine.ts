import { keepPreSyncBackup, loadPersonal, loadSyncDevice, saveSyncDevice } from '../storage.ts';
import type { RemoteSnapshot, SyncBackend, SyncUser } from './backend.ts';
import { applyRemote, localItems, readLocal } from './local.ts';
import { reconcile, type Item } from './model.ts';

export type SyncState =
  | { kind: 'signed-out'; message?: string }
  | { kind: 'connecting'; email?: string }
  | { kind: 'offline'; email?: string }
  | { kind: 'saving'; email?: string }
  | { kind: 'synced'; email?: string; at: string }
  | { kind: 'error'; email?: string; message: string };

const GENERIC_ERROR = 'הסנכרון נכשל. אפשר לנסות שוב.';

/** A message for the person, or undefined when nothing went wrong from their point of view. */
export function describeError(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return undefined;
    case 'auth/popup-blocked':
      return 'הדפדפן חסם את חלון ההתחברות. לחצו שוב על "התחברות עם Google".';
    case 'auth/unauthorized-domain':
      return 'הכתובת הזו לא מאושרת להתחברות בפרויקט Firebase.';
    case 'auth/network-request-failed':
      return 'אין חיבור לרשת. אפשר לנסות שוב כשהחיבור יחזור.';
    case 'permission-denied':
      return 'אין הרשאה לנתונים בענן — כנראה שכללי Firestore לא מאפשרים לחשבון הזה.';
    default:
      return GENERIC_ERROR;
  }
}

/**
 * Keeps this device's "שלי" and the cloud in step, for whoever is signed in:
 *  - on connecting, compares everything (see `reconcile`) — after keeping a backup of this device;
 *  - afterwards, applies what other devices change and pushes what this device changes.
 * Until the server's first full answer arrives nothing is pushed: this device's changes are
 * dated (clocks) and go up with that first comparison.
 */
export class SyncEngine {
  private user: SyncUser | null = null;
  private unlisten?: () => void;
  private unwatchUser?: () => void;
  private reconciled = false;
  private writes = 0;
  private snapshot?: Pick<RemoteSnapshot, 'fromCache' | 'pendingWrites'>;
  private error?: string;

  constructor(
    private readonly backend: SyncBackend,
    private readonly hooks: { onRemote(): void; onState(state: SyncState): void },
  ) {}

  start(): void {
    this.unwatchUser ??= this.backend.onUser((user) => this.setUser(user));
  }

  stop(): void {
    this.unwatchUser?.();
    this.unwatchUser = undefined;
    this.unlisten?.();
    this.unlisten = undefined;
  }

  async signIn(): Promise<void> {
    try {
      await this.backend.signIn();
    } catch (error) {
      this.hooks.onState({ kind: 'signed-out', message: describeError(error) });
    }
  }

  /** Stops syncing on this device. Its data stays here, and in the cloud. */
  async signOut(): Promise<void> {
    saveSyncDevice({ linked: false });
    await this.backend.signOut();
  }

  /** Start over after an error: listen again and compare everything. */
  retry(): void {
    if (this.user) this.setUser(this.user);
  }

  /** Send this device's changes (keys from `recordLocalChange`). */
  push(keys: readonly string[]): void {
    if (!this.user || !this.reconciled || !keys.length) return;
    this.send(this.user, localItems(keys));
  }

  private setUser(user: SyncUser | null): void {
    this.unlisten?.();
    this.unlisten = undefined;
    this.user = user;
    this.reconciled = false;
    this.snapshot = undefined;
    this.error = undefined;
    if (!user) {
      this.hooks.onState({ kind: 'signed-out' });
      return;
    }
    saveSyncDevice({ ...loadSyncDevice(), linked: true, email: user.email });
    this.report();
    this.unlisten = this.backend.listen(
      user.uid,
      (snapshot) => this.onSnapshot(user, snapshot),
      (error) => this.fail(user, error),
    );
  }

  private onSnapshot(user: SyncUser, snapshot: RemoteSnapshot): void {
    if (user !== this.user) return;
    this.snapshot = snapshot;
    if (!this.reconciled) {
      // Only the server's full picture can tell what this device is missing or has extra.
      if (snapshot.fromCache) return this.report();
      keepPreSyncBackup(user.uid, loadPersonal());
      this.reconciled = true;
      this.merge(user, snapshot.all(), true);
    } else if (snapshot.changes.length) {
      this.merge(user, snapshot.changes, false);
    }
    this.report();
  }

  private merge(user: SyncUser, items: readonly Item[], full: boolean): void {
    const { apply, push } = reconcile(readLocal(), items, full);
    if (apply.length && applyRemote(apply)) this.hooks.onRemote();
    this.send(user, push);
  }

  private send(user: SyncUser, items: readonly Item[]): void {
    if (!items.length) return;
    this.writes++;
    this.report();
    this.backend.write(user.uid, items).then(
      () => {
        this.writes--;
        this.report();
      },
      (error: unknown) => {
        this.writes--;
        this.fail(user, error);
      },
    );
  }

  private fail(user: SyncUser, error: unknown): void {
    if (user !== this.user) return;
    this.error = describeError(error) ?? GENERIC_ERROR;
    this.report();
  }

  private report(): void {
    const user = this.user;
    if (!user) return;
    const { email } = user;
    if (this.error) return this.hooks.onState({ kind: 'error', email, message: this.error });
    if (this.snapshot?.fromCache) return this.hooks.onState({ kind: 'offline', email });
    if (!this.reconciled) return this.hooks.onState({ kind: 'connecting', email });
    if (this.writes > 0 || this.snapshot?.pendingWrites)
      return this.hooks.onState({ kind: 'saving', email });
    const at = new Date().toISOString();
    saveSyncDevice({ linked: true, email, lastSyncedAt: at });
    this.hooks.onState({ kind: 'synced', email, at });
  }
}
