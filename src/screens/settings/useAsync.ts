import { useCallback, useEffect, useState } from 'react';

/** Loads data once (and on reload), keeping loading and error state for the screen. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await run());
    } catch {
      setError("Couldn't load this. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, error, loading, reload };
}

export const SAVE_ERROR = "Couldn't save. Check your connection and try again.";
