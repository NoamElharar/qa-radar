import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  initializeFirestore,
  onSnapshot,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { FirebaseWebConfig, SyncBackend } from './backend.ts';
import type { Item } from './model.ts';

/** Firestore takes up to 500 writes per batch. */
const BATCH_SIZE = 400;

/**
 * One document per item: users/{uid}/items/{key}, holding { k: key, v: JSON text or null, t: changedAt }.
 * The value travels as JSON text, so Firestore's own rules about field values never get in the way.
 */
function toItem(snapshot: QueryDocumentSnapshot<DocumentData>): Item | undefined {
  const { k, v, t } = snapshot.data();
  if (typeof k !== 'string' || typeof t !== 'string' || Number.isNaN(Date.parse(t)))
    return undefined;
  if (v === null) return { key: k, value: null, changedAt: t };
  if (typeof v !== 'string') return undefined;
  try {
    return { key: k, value: JSON.parse(v) as unknown, changedAt: t };
  } catch {
    return undefined;
  }
}

export function createFirebaseBackend(config: FirebaseWebConfig): SyncBackend {
  const app = initializeApp(config);
  // Created with the popup helper up front: on Safari and phones it then prepares right away, so a
  // tap on "התחברות" can open the Google window immediately (a late window gets blocked).
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // The default in-memory cache: the dashboard keeps its own copy in localStorage, and anything not
  // yet sent when a page closes goes up with the next visit's first comparison.
  const db = initializeFirestore(app, {});
  const items = (uid: string) => collection(db, 'users', uid, 'items');

  return {
    onUser: (callback) =>
      onAuthStateChanged(auth, (user) =>
        callback(user ? { uid: user.uid, email: user.email ?? undefined } : null),
      ),

    signIn: async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    },

    signOut: () => signOut(auth),

    listen: (uid, onNext, onError) =>
      onSnapshot(
        items(uid),
        { includeMetadataChanges: true },
        (snapshot) =>
          onNext({
            all: () => snapshot.docs.flatMap((d) => toItem(d) ?? []),
            changes: snapshot
              .docChanges()
              .filter((c) => c.type !== 'removed')
              .flatMap((c) => toItem(c.doc) ?? []),
            fromCache: snapshot.metadata.fromCache,
            pendingWrites: snapshot.metadata.hasPendingWrites,
          }),
        onError,
      ),

    write: async (uid, list) => {
      const commits: Promise<void>[] = [];
      for (let i = 0; i < list.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        for (const item of list.slice(i, i + BATCH_SIZE)) {
          batch.set(doc(items(uid), encodeURIComponent(item.key)), {
            k: item.key,
            v: item.value === null ? null : JSON.stringify(item.value),
            t: item.changedAt,
          });
        }
        // All batches are queued at once (each applies locally right away, and waits for the
        // server while offline).
        commits.push(batch.commit());
      }
      await Promise.all(commits);
    },
  };
}
