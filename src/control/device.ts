import { PermissionsAndroid, Platform } from 'react-native';
import type {
  CheckLocation,
  Connection,
  LocationStatus,
} from '../api/appControl';
import NativeMaesDevice from '../native/NativeMaesDevice';

/** The native module, or null where it doesn't exist (iOS, tests that remove it). */
export const nativeDevice = NativeMaesDevice;

export type DeviceIdentity = {
  deviceId: string;
  model: string;
  osVersion: string;
  connection: Connection;
};

const CONNECTIONS: readonly Connection[] = [
  'wifi',
  'cellular',
  'ethernet',
  'other',
  'none',
];

/** Null when this device can't identify itself (no native module / no id). */
export async function getIdentity(): Promise<DeviceIdentity | null> {
  if (!nativeDevice) {
    return null;
  }
  const info = await nativeDevice.getInfo();
  if (!info.deviceId) {
    return null;
  }
  return {
    deviceId: info.deviceId,
    model: info.model,
    osVersion: info.osVersion,
    connection: (CONNECTIONS as readonly string[]).includes(info.connection)
      ? (info.connection as Connection)
      : 'other',
  };
}

/** A position at most this old is used as it is; older → ask for a fresh one. */
export const LOCATION_MAX_AGE_MS = 2 * 60 * 1000;
/** How long a fresh position may take (indoors the GPS may never answer). */
export const LOCATION_TIMEOUT_MS = 15 * 1000;

export type LocationReading = {
  status: LocationStatus;
  location: CheckLocation | null;
};

const LOCATION_STATUSES: readonly LocationStatus[] = [
  'ok',
  'off',
  'denied',
  'none',
  'unavailable',
];

export async function readLocation(): Promise<LocationReading> {
  if (!nativeDevice) {
    return { status: 'unavailable', location: null };
  }
  const raw = await nativeDevice.getLocation(
    LOCATION_MAX_AGE_MS,
    LOCATION_TIMEOUT_MS,
  );
  const status = (LOCATION_STATUSES as readonly string[]).includes(raw.status)
    ? (raw.status as LocationStatus)
    : 'none';
  if (status !== 'ok') {
    return { status, location: null };
  }
  return {
    status,
    location: {
      latitude: raw.latitude,
      longitude: raw.longitude,
      accuracyM: raw.accuracy >= 0 ? raw.accuracy : null,
      ageS: Math.round(raw.ageMs / 1000),
      mock: raw.mock,
    },
  };
}

export type LocationPermission = 'granted' | 'denied' | 'blocked';

export async function hasLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const [fine, coarse] = await Promise.all([
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
    PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ),
  ]);
  return fine || coarse;
}

/** Asks for the (precise) location permission if it isn't granted yet. */
export async function requestLocationPermission(): Promise<LocationPermission> {
  if (Platform.OS !== 'android') {
    return 'denied';
  }
  if (await hasLocationPermission()) {
    return 'granted';
  }
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);
  const values = Object.values(result);
  if (values.includes(PermissionsAndroid.RESULTS.GRANTED)) {
    return 'granted';
  }
  return values.includes(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)
    ? 'blocked'
    : 'denied';
}
