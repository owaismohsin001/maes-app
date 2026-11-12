import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Codegen spec of the native module that tells who and where this device is,
 * for the app-control check (Android: `com.maesapp.device.MaesDeviceModule`).
 * Use it through `src/control/`, not directly.
 *
 * Codegen can't express string unions here; the allowed values are listed in
 * the comments and narrowed in `src/control/device.ts`.
 */

export type DeviceInfo = {
  /** Android's ANDROID_ID: stable for this app on this device (survives a reinstall). '' when unknown. */
  deviceId: string;
  /** Manufacturer + model, e.g. "HC CM60". */
  model: string;
  /** Android version, e.g. "11". */
  osVersion: string;
  /** Current network: 'wifi' | 'cellular' | 'ethernet' | 'other' | 'none' */
  connection: string;
};

export type DeviceLocation = {
  /**
   * 'ok' (a position below) | 'off' (location switched off) | 'denied' (no
   * permission) | 'none' (no position in time) | 'unavailable' (no location
   * service on this device)
   */
  status: string;
  latitude: number;
  longitude: number;
  /** Radius of 68 % confidence in metres; -1 when the provider gave none. */
  accuracy: number;
  /** How old the position is, in milliseconds. */
  ageMs: number;
  /** The position came from a mock-location app. */
  mock: boolean;
};

export interface Spec extends TurboModule {
  getInfo(): Promise<DeviceInfo>;
  /**
   * The newest position: the last known one when it is at most `maxAgeMs`
   * old, otherwise a fresh one (GPS and network providers in parallel), or
   * after `timeoutMs` the best older one ('none' when there is none at all).
   * Never asks for the permission itself.
   */
  getLocation(maxAgeMs: number, timeoutMs: number): Promise<DeviceLocation>;
}

/** Null where the module doesn't exist (iOS). */
export default TurboModuleRegistry.get<Spec>('MaesDevice');
