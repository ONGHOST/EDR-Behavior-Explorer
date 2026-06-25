import { useCallback, useEffect, useRef, useState } from "react";

export interface PollResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  connected: boolean;
  lastUpdated: number | null;
  refresh: () => void;
}

/**
 * Polls `fetcher` every `intervalMs`. On error, keeps showing the last good
 * data (so the UI doesn't blank out on a transient blip) but flips
 * `connected` to false — that's what the topbar status pill reads.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[] = []): PollResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(() => {
    fetcherRef
      .current()
      .then((result) => {
        setData(result);
        setError(null);
        setConnected(true);
        setLastUpdated(Date.now());
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setConnected(false);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    run();
    const id = setInterval(run, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, run, ...deps]);

  return { data, error, loading, connected, lastUpdated, refresh: run };
}
