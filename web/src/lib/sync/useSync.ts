import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadSyncDevice } from '../storage.ts';
import { loadBackend, syncAvailable } from './backend.ts';
import { SyncEngine, type SyncState } from './engine.ts';

/** The engine's states, plus: `idle` (sync never used on this device) and `loading` (its code is downloading). */
export type SyncView = SyncState | { kind: 'idle' } | { kind: 'loading' };

export interface Sync {
  /** This build has sync (a Firebase project is configured). */
  available: boolean;
  state: SyncView;
  /** Download the sync code ahead of a sign-in, so the Google window can open the moment it's tapped. */
  prepare(): void;
  signIn(): void;
  signOut(): void;
  retry(): void;
  /** Send this device's changes (keys from `recordLocalChange`). */
  push(keys: readonly string[]): void;
}

const LOAD_ERROR = 'טעינת הסנכרון נכשלה. בדקו את החיבור לרשת ונסו שוב.';

export function useSync(onRemote: () => void): Sync {
  const [available] = useState(syncAvailable);
  const [linkedAtStart] = useState(() => available && loadSyncDevice().linked);
  const [state, setState] = useState<SyncView>(
    linkedAtStart ? { kind: 'loading' } : { kind: 'idle' },
  );
  const engine = useRef<SyncEngine | null>(null);
  const loading = useRef<Promise<SyncEngine | null> | null>(null);
  const remote = useRef(onRemote);
  useLayoutEffect(() => {
    remote.current = onRemote;
  }, [onRemote]);

  const ensure = useCallback((): Promise<SyncEngine | null> => {
    loading.current ??= loadBackend().then(
      (backend) => {
        if (!backend) return null;
        const created = new SyncEngine(backend, {
          onRemote: () => remote.current(),
          onState: setState,
        });
        created.start();
        engine.current = created;
        return created;
      },
      () => {
        loading.current = null;
        setState({ kind: 'error', message: LOAD_ERROR });
        return null;
      },
    );
    return loading.current;
  }, []);

  // A device that synced before reconnects on its own.
  useEffect(() => {
    if (!linkedAtStart) return;
    void ensure().then((e) => e?.start());
    return () => engine.current?.stop();
  }, [linkedAtStart, ensure]);

  const prepare = useCallback(() => {
    if (available) void ensure();
  }, [available, ensure]);

  const signIn = useCallback(() => {
    // Already loaded: sign in within this tap. Otherwise load first (Safari may then block the
    // window; the message asks for a second tap, which works).
    if (engine.current) void engine.current.signIn();
    else {
      setState({ kind: 'loading' });
      void ensure().then((e) => e?.signIn());
    }
  }, [ensure]);

  const signOut = useCallback(() => void engine.current?.signOut(), []);
  const retry = useCallback(() => {
    if (engine.current) engine.current.retry();
    else void ensure();
  }, [ensure]);
  const push = useCallback((keys: readonly string[]) => engine.current?.push(keys), []);

  return { available, state, prepare, signIn, signOut, retry, push };
}
