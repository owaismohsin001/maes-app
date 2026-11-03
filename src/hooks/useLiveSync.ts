import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/** Without a change for this long, check at the slower pace. */
const IDLE_AFTER_MS = 60000;

// `currentState` can be 'unknown' right after launch: only a known
// background state stops the checks.
const foreground = (state: AppStateStatus | string | null | undefined) =>
  state !== 'background' && state !== 'inactive';

type Options = {
  /**
   * A cheap fingerprint of the record on the server (ids + write dates): it
   * changes whenever the record does.
   */
  stamp: () => Promise<string>;
  /**
   * The record changed on the server: load and show it. Return false when
   * that can't be done right now (the user is busy); the next check retries.
   */
  onChange: () => Promise<boolean>;
  /** Off while there's nothing to watch (loading, closed, validating). */
  enabled: boolean;
  /** Pace right after opening or after a change. */
  intervalMs?: number;
  /** Pace once nothing changed for a minute. */
  idleIntervalMs?: number;
};

/**
 * Keeps an open record in step with Odoo while its screen is on top and the
 * app is in the foreground: every few seconds one small request asks whether
 * it changed, and only then is the full record loaded again. Stops in the
 * background and checks at once on return.
 */
export function useLiveSync({
  stamp,
  onChange,
  enabled,
  intervalMs = 10000,
  idleIntervalMs = 30000,
}: Options): { rebase: (known?: string) => void } {
  const stampRef = useRef(stamp);
  stampRef.current = stamp;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const baselineRef = useRef<string | null>(null);
  /** Bumped by rebase(): a check started before it is ignored. */
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastChangeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const checkRef = useRef<() => Promise<void>>(async () => {});
  const schedule = useCallback(() => {
    clear();
    if (!activeRef.current) {
      return;
    }
    const idle = Date.now() - lastChangeRef.current > IDLE_AFTER_MS;
    timerRef.current = setTimeout(
      () => checkRef.current(),
      idle ? idleIntervalMs : intervalMs,
    );
  }, [intervalMs, idleIntervalMs]);

  checkRef.current = async () => {
    if (inFlightRef.current || !activeRef.current) {
      return;
    }
    inFlightRef.current = true;
    const generation = generationRef.current;
    try {
      const now = await stampRef.current();
      if (generation !== generationRef.current) {
        return;
      }
      if (baselineRef.current === null) {
        baselineRef.current = now;
      } else if (now !== baselineRef.current) {
        if (await onChangeRef.current()) {
          baselineRef.current = now;
          lastChangeRef.current = Date.now();
        }
      }
    } catch {
      // Offline or a hiccup: the next check tries again.
    } finally {
      inFlightRef.current = false;
      schedule();
    }
  };

  /**
   * The data on screen is fresh (loaded or just saved): take its stamp, the
   * one given or a newly fetched one.
   */
  const rebase = useCallback((known?: string) => {
    const generation = ++generationRef.current;
    lastChangeRef.current = Date.now();
    if (known !== undefined) {
      baselineRef.current = known;
      return;
    }
    stampRef
      .current()
      .then(now => {
        if (generation === generationRef.current) {
          baselineRef.current = now;
        }
      })
      // Keep the old baseline: at worst one reload too many, whereas taking
      // the next check's stamp as baseline would hide a change made meanwhile.
      .catch(() => {});
  }, []);

  useEffect(() => {
    activeRef.current = enabled && foreground(AppState.currentState);
    schedule();
    const sub = AppState.addEventListener('change', state => {
      activeRef.current = enabled && foreground(state);
      if (activeRef.current) {
        clear();
        checkRef.current();
      } else {
        clear();
      }
    });
    return () => {
      activeRef.current = false;
      sub.remove();
      clear();
    };
  }, [enabled, schedule]);

  return { rebase };
}
