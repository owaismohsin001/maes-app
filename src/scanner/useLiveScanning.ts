import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { ScanProblem } from './scanner';
import { useScanner } from './useScanner';
import type { Scanner } from './useScanner';

/**
 * Pause after a read before the next one starts. Short: the same label still
 * under the scanner is dropped by `REPEAT_WINDOW_MS`, so this only limits how
 * fast different labels can follow each other.
 */
export const RESTART_AFTER_READ_MS = 250;
/** Pause before retrying after a failed read. */
export const RETRY_AFTER_FAILURE_MS = 1000;
/** Failed reads in a row (not timeouts) before live reading stops. */
export const MAX_FAILURES = 3;
/**
 * The same code read again within this time of its previous read is the same
 * label still under the scanner, not a second item: it isn't sent again (only
 * reported to `onRepeat`). Each repeat read restarts the window.
 */
export const REPEAT_WINDOW_MS = 1200;

type Options = {
  /** Read continuously while true (the scanner screen is shown). */
  live: boolean;
  /** A code was accepted: beeped, and to be sent on. */
  onCode: (code: string) => void;
  /** The same label read again within `REPEAT_WINDOW_MS`: not sent as a new item. */
  onRepeat?: (code: string) => void;
  /** A problem to show outside live reading (side button, test scans), or that needs a dialog. */
  notify: (problem: ScanProblem) => void;
};

export type LiveScanning = {
  scanner: Scanner;
  /** Live, and the first read of this opening hasn't started yet. */
  starting: boolean;
  /** Why live reading stopped; null while it runs. */
  problem: ScanProblem | null;
  /** Start live reading again after a problem. */
  restart: () => void;
};

/**
 * The handheld's scanner, reading continuously while `live`: one read after
 * the other, no tap needed. A timeout (8 s without a code) just starts the
 * next read. Outside live reading the side button still triggers single reads.
 */
export function useLiveScanning({
  live,
  onCode,
  onRepeat,
  notify,
}: Options): LiveScanning {
  const [problem, setProblem] = useState<ScanProblem | null>(null);
  const [started, setStarted] = useState(false);

  const liveRef = useRef(live);
  liveRef.current = live;
  const problemRef = useRef(problem);
  problemRef.current = problem;
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const onRepeatRef = useRef(onRepeat);
  onRepeatRef.current = onRepeat;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const failuresRef = useRef(0);
  const lastReadRef = useRef<{ code: string; at: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanRef = useRef<() => Promise<void>>(async () => {});
  const feedbackRef = useRef<() => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scanLater = useCallback(
    (ms: number) => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (liveRef.current && !problemRef.current) {
          scanRef.current();
        }
      }, ms);
    },
    [clearTimer],
  );

  const stopLive = useCallback((reason: ScanProblem) => {
    problemRef.current = reason;
    setProblem(reason);
  }, []);

  const handleCode = useCallback(
    (code: string) => {
      if (!liveRef.current) {
        feedbackRef.current();
        onCodeRef.current(code);
        return;
      }
      failuresRef.current = 0;
      const now = Date.now();
      const last = lastReadRef.current;
      lastReadRef.current = { code, at: now };
      if (!last || last.code !== code || now - last.at >= REPEAT_WINDOW_MS) {
        feedbackRef.current();
        onCodeRef.current(code);
      } else {
        onRepeatRef.current?.(code);
      }
      scanLater(RESTART_AFTER_READ_MS);
    },
    [scanLater],
  );

  const handleProblem = useCallback(
    (reason: ScanProblem) => {
      if (!liveRef.current) {
        notifyRef.current(reason);
        return;
      }
      if (reason === 'timeout') {
        scanLater(0);
        return;
      }
      if (
        (reason === 'noImage' || reason === 'error' || reason === 'notReady') &&
        ++failuresRef.current < MAX_FAILURES
      ) {
        scanLater(RETRY_AFTER_FAILURE_MS);
        return;
      }
      if (reason === 'permissionBlocked') {
        notifyRef.current(reason); // offers the way to Settings
      }
      stopLive(reason);
    },
    [scanLater, stopLive],
  );

  const scanner = useScanner({ onCode: handleCode, onProblem: handleProblem });
  scanRef.current = scanner.scan;
  feedbackRef.current = scanner.feedback;
  const stopRef = useRef(scanner.stop);
  stopRef.current = scanner.stop;

  const begin = useCallback(() => {
    failuresRef.current = 0;
    lastReadRef.current = null;
    problemRef.current = null;
    setProblem(null);
    scanRef.current();
  }, []);

  const wasLiveRef = useRef(false);
  useEffect(() => {
    if (live) {
      setStarted(false);
      begin();
    } else if (wasLiveRef.current) {
      clearTimer();
      stopRef.current();
    }
    wasLiveRef.current = live;
  }, [live, begin, clearTimer]);

  // The first read of an opening has started: the loading state is over.
  useEffect(() => {
    if (live && scanner.scanning) {
      setStarted(true);
    }
  }, [live, scanner.scanning]);

  // Android stops the scanner when the app leaves the foreground; carry on when it's back.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && liveRef.current && !problemRef.current) {
        scanLater(300);
      }
    });
    return () => subscription.remove();
  }, [scanLater]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    scanner,
    starting: live && !started && problem === null,
    problem,
    restart: begin,
  };
}
