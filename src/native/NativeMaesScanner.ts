import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Codegen spec of the native module around the handheld's built-in barcode
 * scanner (Android: `com.maesapp.scanner.MaesScannerModule`, on top of
 * `android/libscan`). Use it through `src/scanner/`, not directly.
 *
 * Codegen can't express string unions here; the allowed values are listed in
 * the comments and narrowed in `src/scanner/scanner.ts`.
 */

export type ScannerStatus = {
  /** 'unavailable' (no scanner on this device) | 'idle' | 'ready' | 'error' */
  state: string;
  /** Why the scanner is unavailable or failed; '' otherwise. */
  error: string;
  scanning: boolean;
  /** Versions reported by the SDK once ready; '' when unknown. */
  sdkVersion: string;
  scannerVersion: string;
  decodeVersion: string;
  /** Android key code of the hardware scan button. */
  scanKeyCode: number;
  /** Whether the handheld's own scan service is installed (it is switched off while the app scans). */
  helperInstalled: boolean;
  cameraCount: number;
};

export type ScanEvent = {
  /**
   * 'started' | 'decoded' | 'stopped' | 'timeout' | 'noImage' | 'error' |
   * 'overheat' | 'notReady' | 'unavailable'
   */
  type: string;
  /** The decoded text for 'decoded'; '' otherwise. */
  code: string;
};

export interface Spec extends TurboModule {
  getStatus(): Promise<ScannerStatus>;
  /** Powers the scanner up (first call also switches off the handheld's own scan service). Needs the camera permission. */
  prepare(): Promise<ScannerStatus>;
  /** One read: ends with 'decoded', 'timeout' (8 s) or another end event. */
  startScan(): void;
  stopScan(): void;
  /** Beep and vibrate: a code was accepted. */
  feedback(): void;
  /** Resolves with the next key pressed (Back excluded), saved as the scan button. */
  learnScanKey(): Promise<number>;
  cancelLearnScanKey(): void;
  readonly onScanEvent: CodegenTypes.EventEmitter<ScanEvent>;
  /** The hardware scan button was pressed. */
  readonly onScanKey: CodegenTypes.EventEmitter<void>;
}

/** Null where the module doesn't exist (iOS). */
export default TurboModuleRegistry.get<Spec>('MaesScanner');
