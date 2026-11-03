import { PermissionsAndroid, Platform } from 'react-native';
import type { TranslationKey } from '../i18n';
import NativeMaesScanner from '../native/NativeMaesScanner';
import type { ScannerStatus } from '../native/NativeMaesScanner';

export type { ScannerStatus };

/**
 * The handheld's built-in scanner, or null where the native module doesn't
 * exist (iOS). On an Android phone without the scanner the module exists but
 * reports `state: 'unavailable'`.
 */
export const nativeScanner = NativeMaesScanner;

export type ScannerState = 'unavailable' | 'idle' | 'ready' | 'error';

/** `status.state`, narrowed; anything unexpected counts as an error. */
export function scannerState(status: ScannerStatus): ScannerState {
  const { state } = status;
  return state === 'unavailable' || state === 'idle' || state === 'ready'
    ? state
    : 'error';
}

export const SCANNER_STATE_LABELS: Record<ScannerState, TranslationKey> = {
  ready: 'scanner.state.ready',
  idle: 'scanner.state.idle',
  error: 'scanner.state.error',
  unavailable: 'scanner.state.unavailable',
};

export const SCANNER_STATE_COLORS: Record<ScannerState, string> = {
  ready: '#16A34A',
  idle: '#D97706',
  error: '#DC2626',
  unavailable: '#6B7280',
};

/** Why a scan didn't produce a code (shown to the user). */
export type ScanProblem =
  | 'permissionDenied'
  | 'permissionBlocked'
  | 'unavailable'
  | 'notReady'
  | 'timeout'
  | 'noImage'
  | 'overheat'
  | 'error';

/** The problem behind a native end-of-scan event; null for normal events. */
export function scanEventProblem(type: string): ScanProblem | null {
  switch (type) {
    case 'started':
    case 'decoded':
    case 'stopped':
      return null;
    case 'unavailable':
    case 'notReady':
    case 'timeout':
    case 'noImage':
    case 'overheat':
      return type;
    default:
      return 'error';
  }
}

export const SCAN_PROBLEM_MESSAGES: Record<ScanProblem, TranslationKey> = {
  permissionDenied: 'scanner.problem.permissionDenied',
  permissionBlocked: 'scanner.cameraBlockedBody',
  unavailable: 'scanner.problem.unavailable',
  notReady: 'scanner.problem.notReady',
  timeout: 'scanner.problem.timeout',
  noImage: 'scanner.problem.noImage',
  overheat: 'scanner.problem.overheat',
  error: 'scanner.problem.error',
};

export type CameraPermission = 'granted' | 'denied' | 'blocked';

/** The scan engine is a camera module, so reading needs the camera permission. */
export async function hasCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
}

/** Asks for the camera permission if it isn't granted yet. */
export async function requestCameraPermission(): Promise<CameraPermission> {
  if (await hasCameraPermission()) {
    return 'granted';
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
  );
  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return 'granted';
  }
  return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
    ? 'blocked'
    : 'denied';
}
