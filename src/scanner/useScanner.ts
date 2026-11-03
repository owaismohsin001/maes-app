import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  hasCameraPermission,
  nativeScanner,
  requestCameraPermission,
  scanEventProblem,
  scannerState,
} from './scanner';
import type { ScanProblem, ScannerStatus } from './scanner';

type Options = {
  /** A code was read: via `scan()` or the hardware scan button. */
  onCode: (code: string) => void;
  /** A read ended without a code, or couldn't start. */
  onProblem?: (problem: ScanProblem) => void;
};

export type Scanner = {
  /** False where there is no scanner module at all (iOS). */
  supported: boolean;
  /** Null until the native side has answered. */
  status: ScannerStatus | null;
  /** A read is running. */
  scanning: boolean;
  /** Asking for the camera permission / powering up before a read. */
  starting: boolean;
  /** The last code read, for the status screen. */
  lastCode: string | null;
  scan: () => Promise<void>;
  stop: () => void;
  /** Beep and vibrate: call when a code is accepted. */
  feedback: () => void;
  /** Asks for the camera permission and powers the scanner up again. */
  retry: () => Promise<void>;
  /** Saves the next key pressed as the scan button; null when cancelled. */
  learnScanKey: () => Promise<number | null>;
  cancelLearnScanKey: () => void;
};

/**
 * The handheld's built-in scanner. The camera permission is asked for on the
 * first read (or right away on mount if it was granted before, to power the
 * scanner up early); the hardware scan button triggers `scan()` too.
 */
export function useScanner({ onCode, onProblem }: Options): Scanner {
  const [status, setStatus] = useState<ScannerStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const statusRef = useRef<ScannerStatus | null>(null);
  const startingRef = useRef(false);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const onProblemRef = useRef(onProblem);
  onProblemRef.current = onProblem;

  const applyStatus = useCallback((next: ScannerStatus) => {
    statusRef.current = next;
    if (mountedRef.current) {
      setStatus(next);
    }
    return next;
  }, []);

  /** Camera permission granted and scanner powered up; reports why not otherwise. */
  const ensureReady = useCallback(async (): Promise<boolean> => {
    if (!nativeScanner) {
      return false;
    }
    const report = (problem: ScanProblem) => {
      onProblemRef.current?.(problem);
      return false;
    };
    // Know first whether there is a scanner at all: no camera prompt on phones without one.
    let current =
      statusRef.current ?? applyStatus(await nativeScanner.getStatus());
    if (scannerState(current) === 'unavailable') {
      return report('unavailable');
    }
    const camera = await requestCameraPermission();
    if (camera !== 'granted') {
      return report(
        camera === 'blocked' ? 'permissionBlocked' : 'permissionDenied',
      );
    }
    if (scannerState(current) !== 'ready') {
      current = applyStatus(await nativeScanner.prepare());
    }
    const state = scannerState(current);
    if (state !== 'ready') {
      return report(state === 'unavailable' ? 'unavailable' : 'notReady');
    }
    return true;
  }, [applyStatus]);

  const scan = useCallback(async () => {
    if (!nativeScanner || startingRef.current) {
      return;
    }
    startingRef.current = true;
    setStarting(true);
    try {
      if (await ensureReady()) {
        nativeScanner.startScan();
      }
    } catch {
      onProblemRef.current?.('error');
    } finally {
      startingRef.current = false;
      if (mountedRef.current) {
        setStarting(false);
      }
    }
  }, [ensureReady]);

  const stop = useCallback(() => nativeScanner?.stopScan(), []);
  const feedback = useCallback(() => nativeScanner?.feedback(), []);

  const retry = useCallback(async () => {
    if (!nativeScanner) {
      return;
    }
    try {
      await ensureReady();
      applyStatus(await nativeScanner.getStatus());
    } catch {
      onProblemRef.current?.('error');
    }
  }, [ensureReady, applyStatus]);

  const learnScanKey = useCallback(async () => {
    if (!nativeScanner) {
      return null;
    }
    try {
      const keyCode = await nativeScanner.learnScanKey();
      if (statusRef.current) {
        applyStatus({ ...statusRef.current, scanKeyCode: keyCode });
      }
      return keyCode;
    } catch {
      return null; // cancelled
    }
  }, [applyStatus]);

  const cancelLearnScanKey = useCallback(
    () => nativeScanner?.cancelLearnScanKey(),
    [],
  );

  // Power up early when the permission is already there, so the first read is quick.
  useEffect(() => {
    mountedRef.current = true;
    const module = nativeScanner;
    if (module) {
      (async () => {
        const current = applyStatus(await module.getStatus());
        if (scannerState(current) === 'idle' && (await hasCameraPermission())) {
          applyStatus(await module.prepare());
        }
      })().catch(() => {});
    }
    return () => {
      mountedRef.current = false;
    };
  }, [applyStatus]);

  const scanRef = useRef(scan);
  scanRef.current = scan;
  useEffect(() => {
    if (!nativeScanner) {
      return;
    }
    const subscriptions = [
      nativeScanner.onScanEvent(({ type, code }) => {
        if (type === 'started') {
          setScanning(true);
          return;
        }
        setScanning(false);
        if (type === 'decoded') {
          setLastCode(code);
          onCodeRef.current(code);
          return;
        }
        const problem = scanEventProblem(type);
        if (problem) {
          onProblemRef.current?.(problem);
        }
      }),
      nativeScanner.onScanKey(() => {
        scanRef.current();
      }),
    ];
    return () => subscriptions.forEach(s => s.remove());
  }, []);

  return useMemo(
    () => ({
      supported: nativeScanner != null,
      status,
      scanning,
      starting,
      lastCode,
      scan,
      stop,
      feedback,
      retry,
      learnScanKey,
      cancelLearnScanKey,
    }),
    [
      status,
      scanning,
      starting,
      lastCode,
      scan,
      stop,
      feedback,
      retry,
      learnScanKey,
      cancelLearnScanKey,
    ],
  );
}
