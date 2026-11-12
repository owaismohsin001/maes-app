import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  DEFAULT_INTERVAL_S,
  checkDevice,
  type CheckAnswer,
  type LocationStatus,
  type ServerReason,
} from '../api/appControl';
import {
  getIdentity,
  hasLocationPermission,
  readLocation,
  requestLocationPermission,
  type LocationPermission,
  type LocationReading,
} from './device';

/** Why the app is locked: the server's answer, or no answer / no identity. */
export type LockReason = Exclude<ServerReason, 'ok'> | 'offline' | 'unsupported';

export type AppControlState = {
  /** 'checking' only until the first answer; then 'allowed' or 'locked'. */
  phase: 'checking' | 'allowed' | 'locked';
  reason: LockReason | null;
  /** The last answer of the server (kept while offline). */
  answer: CheckAnswer | null;
  /** The location permission, once the server asked for a position. */
  permission: LocationPermission | null;
  /** What the device said about its position at the last check. */
  locationStatus: LocationStatus | null;
};

export type AppControl = AppControlState & {
  /** A check is running. */
  busy: boolean;
  /** Check now; asks for the location permission again when it is missing. */
  recheck: () => void;
};

/** After a failed check (no connection, server error) ask again this soon. */
export const RETRY_MS = 15 * 1000;

const INITIAL: AppControlState = {
  phase: 'checking',
  reason: null,
  answer: null,
  permission: null,
  locationStatus: null,
};

/**
 * Whether the app may run on this device now (odoo19Module §P450). Asks the
 * control server on start, whenever the app comes back to the foreground and
 * every `interval_s` seconds the server names (60 by default): a device the
 * admin blocks, or an app the admin switches off, locks within one interval.
 *
 * The position is only read once the server asks for it (`need_location`):
 * the first answer that wants one is followed at once by a second check with
 * the position. The location permission is asked once by itself; after that
 * only from the lock screen (`recheck`).
 *
 * No answer (offline, server error): the last 'allowed' holds for the grace
 * time the server named, then the app locks ('offline') until a check
 * succeeds. A locked app stays locked for its own reason.
 */
export function useAppControl(): AppControl {
  const [state, setState] = useState<AppControlState>(INITIAL);
  const [busy, setBusy] = useState(false);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foregroundRef = useRef(AppState.currentState !== 'background');
  const needLocationRef = useRef(false);
  const askedPermissionRef = useRef(false);
  const permissionRef = useRef<LocationPermission | null>(null);
  const lastOkAtRef = useRef<number | null>(null);
  const graceMsRef = useRef(0);
  const intervalMsRef = useRef(DEFAULT_INTERVAL_S * 1000);
  const runRef = useRef<(askPermission: boolean) => void>(() => {});

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const schedule = (ms: number) => {
    clearTimer();
    if (mountedRef.current && foregroundRef.current) {
      timerRef.current = setTimeout(() => runRef.current(false), ms);
    }
  };

  const position = async (askPermission: boolean): Promise<LocationReading> => {
    let permission: LocationPermission;
    if (askPermission || !askedPermissionRef.current) {
      askedPermissionRef.current = true;
      permission = await requestLocationPermission();
    } else if (await hasLocationPermission()) {
      permission = 'granted';
    } else {
      permission =
        permissionRef.current === 'blocked' ? 'blocked' : 'denied';
    }
    permissionRef.current = permission;
    return permission === 'granted'
      ? readLocation()
      : { status: 'denied', location: null };
  };

  const run = async (askPermission: boolean) => {
    if (inFlightRef.current || !mountedRef.current) {
      return;
    }
    inFlightRef.current = true;
    clearTimer();
    setBusy(true);
    try {
      const identity = await getIdentity();
      if (!identity) {
        if (mountedRef.current) {
          setState(prev => ({ ...prev, phase: 'locked', reason: 'unsupported' }));
        }
        schedule(intervalMsRef.current);
        return;
      }
      let answer: CheckAnswer | null = null;
      let reading: LocationReading = { status: 'skipped', location: null };
      // Twice at most: the first answer that asks for a position is followed
      // at once by a check that carries one.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        reading = needLocationRef.current
          ? await position(askPermission)
          : { status: 'skipped', location: null };
        answer = await checkDevice({
          ...identity,
          locationStatus: reading.status,
          location: reading.location,
        });
        const firstAsk = answer.needLocation && !needLocationRef.current;
        needLocationRef.current = answer.needLocation;
        if (!(firstAsk && answer.reason === 'no_location')) {
          break;
        }
      }
      const final = answer as CheckAnswer;
      intervalMsRef.current = final.intervalS * 1000;
      graceMsRef.current = final.graceS * 1000;
      if (final.ok) {
        lastOkAtRef.current = Date.now();
      }
      if (mountedRef.current) {
        setState({
          phase: final.ok ? 'allowed' : 'locked',
          reason: final.ok ? null : (final.reason as LockReason),
          answer: final,
          permission: needLocationRef.current ? permissionRef.current : null,
          locationStatus: reading.status,
        });
      }
      schedule(intervalMsRef.current);
    } catch {
      const lastOk = lastOkAtRef.current;
      const withinGrace =
        lastOk !== null && Date.now() - lastOk <= graceMsRef.current;
      if (mountedRef.current && !withinGrace) {
        setState(prev =>
          prev.phase === 'locked'
            ? prev
            : { ...prev, phase: 'locked', reason: 'offline' },
        );
      }
      schedule(Math.min(RETRY_MS, intervalMsRef.current));
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  };
  runRef.current = run;

  useEffect(() => {
    mountedRef.current = true;
    runRef.current(false);
    const subscription = AppState.addEventListener('change', next => {
      const foreground = next === 'active';
      const wasForeground = foregroundRef.current;
      foregroundRef.current = next !== 'background';
      if (next === 'background') {
        clearTimer();
      } else if (foreground && !wasForeground) {
        runRef.current(false);
      }
    });
    return () => {
      mountedRef.current = false;
      clearTimer();
      subscription.remove();
    };
  }, []);

  const recheck = useCallback(() => runRef.current(true), []);

  return { ...state, busy, recheck };
}
