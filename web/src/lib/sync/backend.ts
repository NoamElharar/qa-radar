import type { Item } from './model.ts';

export interface SyncUser {
  uid: string;
  email?: string;
}

/** What the cloud holds, as seen by one live listener. */
export interface RemoteSnapshot {
  /** Every item in the cloud (read only for the first comparison, so it is built on demand). */
  all: () => Item[];
  /** The items that changed since the listener's previous snapshot. */
  changes: Item[];
  /** Served from memory, not confirmed by the server (offline, or still connecting). */
  fromCache: boolean;
  /** Some of this device's writes are not confirmed by the server yet. */
  pendingWrites: boolean;
}

/** Where synced items live. Firebase in production; a stand-in in the end-to-end tests. */
export interface SyncBackend {
  onUser(callback: (user: SyncUser | null) => void): () => void;
  /** Must open the sign-in window right away (Safari blocks one opened after a delay). */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  listen(
    uid: string,
    onSnapshot: (snapshot: RemoteSnapshot) => void,
    onError: (error: unknown) => void,
  ): () => void;
  /** Resolves when the server has the items (stays pending while offline). */
  write(uid: string, items: readonly Item[]): Promise<void>;
}

declare global {
  interface Window {
    /** End-to-end tests install a stand-in backend here before the app loads. */
    __qaRadarSyncBackend?: SyncBackend;
  }
}

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

/**
 * The Firebase project's web settings, from the build environment (see .env.example). They are
 * public by design — access is guarded by sign-in and the Firestore rules — but a build without
 * them simply has no sync.
 */
export function firebaseConfig(): FirebaseWebConfig | undefined {
  const env = import.meta.env;
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY as unknown,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as unknown,
    projectId: env.VITE_FIREBASE_PROJECT_ID as unknown,
    appId: env.VITE_FIREBASE_APP_ID as unknown,
  };
  return Object.values(config).every((v) => typeof v === 'string' && v.trim() !== '')
    ? (config as FirebaseWebConfig)
    : undefined;
}

export function syncAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    (Boolean(window.__qaRadarSyncBackend) || Boolean(firebaseConfig()))
  );
}

/** The backend, loading Firebase (a separate download) only when sync is actually used. */
export async function loadBackend(): Promise<SyncBackend | undefined> {
  if (window.__qaRadarSyncBackend) return window.__qaRadarSyncBackend;
  const config = firebaseConfig();
  if (!config) return undefined;
  const { createFirebaseBackend } = await import('./firebase.ts');
  return createFirebaseBackend(config);
}
