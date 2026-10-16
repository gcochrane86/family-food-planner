import { useCallback, useEffect, useState } from 'react';

function readKept<T>(key: string | undefined): T | null {
  if (!key) return null;
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}

/** Loads data once (and on reload), keeping loading and error state for the screen. With `keep`, the last data is
 *  kept on this device under that key and shown at once next time, while a fresh copy loads. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[], options: { keep?: string } = {}) {
  const { keep } = options;
  const [data, setData] = useState<T | null>(() => readKept<T>(keep));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => readKept<T>(keep) === null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    // With kept data on screen, refresh quietly instead of going back to "Loading…".
    if (!keep || readKept(keep) === null) setLoading(true);
    setError(null);
    try {
      setData(await run());
    } catch {
      setError("Couldn't load this. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [run, keep]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!keep || data === null) return;
    try { localStorage.setItem(keep, JSON.stringify(data)); } catch { /* storage full or blocked: just don't keep it */ }
  }, [keep, data]);
  return { data, setData, error, loading, reload };
}

export const SAVE_ERROR = "Couldn't save. Check your connection and try again.";
