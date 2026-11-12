import { APP_VERSION, BRAND } from '../config';

/**
 * The app-control check (odoo19Module §P450): may the app run on this device
 * right now? The brand's control server answers from what an administrator set
 * in Odoo (Inventory > Configuration > Scan app): the device allowed or
 * blocked, the app switched on or off, and the allowed place (GPS radius or
 * office network).
 *
 * Public route (`POST /maes_app/check`, JSON in and out): it runs before
 * anybody has signed in, and Castillo Scan's users never sign in to this server.
 */
export const CONTROL_URL = `${BRAND.controlOrigin}/maes_app/check`;

/** What the server can answer. Anything else is treated as 'blocked'. */
export type ServerReason =
  | 'ok'
  | 'pending'
  | 'blocked'
  | 'app_disabled'
  | 'outside_location'
  | 'no_location'
  | 'mock_location'
  | 'unknown_brand';

const SERVER_REASONS: readonly ServerReason[] = [
  'ok',
  'pending',
  'blocked',
  'app_disabled',
  'outside_location',
  'no_location',
  'mock_location',
  'unknown_brand',
];

export type Connection = 'wifi' | 'cellular' | 'ethernet' | 'other' | 'none';
export type LocationStatus =
  | 'ok'
  | 'off'
  | 'denied'
  | 'none'
  | 'unavailable'
  | 'skipped';

export type CheckLocation = {
  latitude: number;
  longitude: number;
  /** Metres; null when the device gave none. */
  accuracyM: number | null;
  ageS: number;
  mock: boolean;
};

export type CheckRequest = {
  deviceId: string;
  model: string;
  osVersion: string;
  connection: Connection;
  locationStatus: LocationStatus;
  location: CheckLocation | null;
};

export type CheckAnswer = {
  ok: boolean;
  reason: ServerReason;
  /** Six characters, shown on the lock screen so the admin finds the device. */
  deviceCode: string;
  /** Whether the server wants a GPS position with the next checks. */
  needLocation: boolean;
  /** The allowed place, e.g. "HQ Lokeren"; '' when not set. */
  locationName: string;
  /** Distance to the allowed point in metres; null when unknown. */
  distanceM: number | null;
  /** Ask again after this many seconds. */
  intervalS: number;
  /** Keep the last 'ok' this many seconds when the server can't be reached. */
  graceS: number;
};

export type ControlErrorKind = 'network' | 'timeout' | 'http' | 'format';

export class ControlError extends Error {
  readonly kind: ControlErrorKind;
  readonly status: number;

  constructor(kind: ControlErrorKind, message: string, status = 0) {
    super(message);
    this.name = 'ControlError';
    this.kind = kind;
    this.status = status;
  }
}

export const DEFAULT_INTERVAL_S = 60;
const MIN_INTERVAL_S = 15;
const MAX_INTERVAL_S = 3600;
const MAX_GRACE_S = 24 * 3600;
const TIMEOUT_MS = 10000;

function clamp(value: unknown, low: number, high: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback;
}

/** The server's JSON → a CheckAnswer. Throws ControlError('format') when it isn't one. */
export function parseAnswer(json: unknown): CheckAnswer {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new ControlError('format', 'Answer is not an object');
  }
  const raw = json as Record<string, unknown>;
  if (typeof raw.ok !== 'boolean' || typeof raw.reason !== 'string') {
    throw new ControlError('format', 'Answer lacks ok / reason');
  }
  const known = (SERVER_REASONS as readonly string[]).includes(raw.reason);
  const reason: ServerReason = known
    ? (raw.reason as ServerReason)
    : 'blocked';
  // Only an explicit ok + 'ok' unlocks; a mixed answer stays locked.
  const ok = raw.ok === true && reason === 'ok';
  return {
    ok,
    reason: ok ? 'ok' : reason === 'ok' ? 'blocked' : reason,
    deviceCode: typeof raw.device_code === 'string' ? raw.device_code : '',
    needLocation: raw.need_location === true,
    locationName:
      typeof raw.location_name === 'string' ? raw.location_name : '',
    distanceM:
      typeof raw.distance_m === 'number' && Number.isFinite(raw.distance_m)
        ? raw.distance_m
        : null,
    intervalS: clamp(
      raw.interval_s,
      MIN_INTERVAL_S,
      MAX_INTERVAL_S,
      DEFAULT_INTERVAL_S,
    ),
    graceS: clamp(raw.grace_s, 0, MAX_GRACE_S, 0),
  };
}

/** The request body the server expects (snake_case). */
export function requestBody(request: CheckRequest) {
  const { location } = request;
  return {
    device_id: request.deviceId,
    brand: BRAND.key,
    model: request.model,
    os_version: request.osVersion,
    app_version: APP_VERSION,
    connection: request.connection,
    location_status: request.locationStatus,
    location: location
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy_m: location.accuracyM,
          age_s: location.ageS,
          mock: location.mock,
        }
      : null,
  };
}

type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** One check. Rejects with a ControlError when no usable answer came. */
export async function checkDevice(
  request: CheckRequest,
  { timeoutMs = TIMEOUT_MS, fetchImpl }: { timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<CheckAnswer> {
  const doFetch: FetchLike = fetchImpl ?? (fetch as unknown as FetchLike);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    let response;
    try {
      response = await doFetch(CONTROL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody(request)),
        signal: controller.signal,
      });
    } catch (e) {
      throw timedOut
        ? new ControlError('timeout', 'No answer in time')
        : new ControlError('network', String(e));
    }
    if (!response.ok) {
      throw new ControlError('http', `HTTP ${response.status}`, response.status);
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ControlError('format', 'Answer is not JSON');
    }
    return parseAnswer(json);
  } finally {
    clearTimeout(timer);
  }
}
