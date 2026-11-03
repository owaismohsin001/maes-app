import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BARCODE_RESULT_DELAY_MS } from '../utils/odooBarcodeScript';
import type { BarcodeResult } from '../utils/odooBarcodeScript';

export type ScanEntry = {
  id: string;
  code: string;
  /** When it was read (ms since epoch). */
  at: number;
  /**
   * 'pending' until Odoo's answer arrives; 'sent' when none came (e.g. the
   * page reloaded); otherwise Odoo's answer.
   */
  level: 'pending' | 'sent' | BarcodeResult['level'];
  /** Odoo's notification text, if it showed one. */
  message: string;
};

const MAX_ENTRIES = 30;
/** Give up waiting for Odoo's answer a little after the page script reports. */
const ANSWER_TIMEOUT_MS = BARCODE_RESULT_DELAY_MS + 2500;

/** The latest codes sent to Odoo, newest first, with Odoo's answer to each. */
export function useScanLog() {
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const counterRef = useRef(0);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  /** Logs a code about to be sent; returns the id to pass to the page script. */
  const add = useCallback((code: string) => {
    const id = `scan-${Date.now()}-${++counterRef.current}`;
    setEntries(prev =>
      [
        { id, code, at: Date.now(), level: 'pending' as const, message: '' },
        ...prev,
      ].slice(0, MAX_ENTRIES),
    );
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      setEntries(prev =>
        prev.map(e =>
          e.id === id && e.level === 'pending' ? { ...e, level: 'sent' } : e,
        ),
      );
    }, ANSWER_TIMEOUT_MS);
    timersRef.current.add(timer);
    return id;
  }, []);

  const resolve = useCallback((result: BarcodeResult) => {
    setEntries(prev =>
      prev.map(e =>
        e.id === result.id
          ? { ...e, level: result.level, message: result.message }
          : e,
      ),
    );
  }, []);

  return useMemo(() => ({ entries, add, resolve }), [entries, add, resolve]);
}
