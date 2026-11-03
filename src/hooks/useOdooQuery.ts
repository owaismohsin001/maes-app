import { useCallback, useEffect, useRef, useState } from 'react';

export type OdooQuery<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** Loads again; keeps the old data on screen meanwhile. */
  reload: () => Promise<void>;
  setData: (data: T | null) => void;
};

/**
 * Loads data from Odoo once (and again on `reload` or when `key` changes).
 * Answers that arrive after a newer request or after unmount are dropped.
 */
export function useOdooQuery<T>(
  load: () => Promise<T>,
  key = '',
): OdooQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const result = await loadRef.current();
      if (mountedRef.current && request === requestRef.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current && request === requestRef.current) {
        setError(e);
      }
    } finally {
      if (mountedRef.current && request === requestRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, key]);

  return { data, error, loading, reload, setData };
}
