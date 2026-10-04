import { useCallback, useEffect, useRef, useState } from 'react';
import { loadData, type RadarData } from './data.ts';
import { relativeTime } from './time.ts';

/** Reload silently when the app comes back to the foreground after this long (e.g. home-screen app in the morning). */
const AUTO_REFRESH_AFTER_MS = 5 * 60 * 1000;
const NOTICE_MS = 4000;

type Mode = 'initial' | 'manual' | 'auto';

/** Loads jobs + source health, with a manual refresh and an automatic refresh on return to the app. */
export function useRadarData() {
  const [data, setData] = useState<RadarData>();
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string>();
  const current = useRef<RadarData | undefined>(undefined);
  const lastFetchAt = useRef(0);

  const load = useCallback(async (mode: Mode) => {
    if (mode === 'manual') setRefreshing(true);
    try {
      const next = await loadData(mode !== 'initial');
      const changed = next.health.generatedAt !== current.current?.health.generatedAt;
      current.current = next;
      lastFetchAt.current = Date.now();
      setData(next);
      setError(undefined);
      if (mode === 'manual') {
        setNotice(
          changed
            ? 'עודכן — נטענו הנתונים האחרונים'
            : `כבר מעודכן — האיסוף האחרון היה ${relativeTime(next.health.generatedAt)}`,
        );
      } else if (mode === 'auto' && changed) {
        setNotice('הנתונים עודכנו');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!current.current) setError(message);
      else if (mode === 'manual') setNotice('הרענון נכשל — בדקו את החיבור לאינטרנט');
    } finally {
      if (mode === 'manual') setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchAt.current > AUTO_REFRESH_AFTER_MS) {
        void load('auto');
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(undefined), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const refresh = useCallback(() => load('manual'), [load]);
  return { data, error, refreshing, notice, refresh };
}
