import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';
import { codegenNativeComponent } from 'react-native';

/**
 * Codegen spec of the live picture from the handheld's scan engine (Android:
 * `com.maesapp.scanner.ScanPreviewManager`, fed by `ScanCamera`'s preview
 * frames while a read runs). Use it through `src/scanner/ScanPreview`.
 */

export type FrameStateEvent = Readonly<{
  /** Frames are arriving; false once none came for a moment. */
  live: boolean;
}>;

export interface NativeProps extends ViewProps {
  /** Clockwise rotation of the camera picture, degrees: 0 | 90 | 180 | 270. */
  imageRotation?: CodegenTypes.WithDefault<CodegenTypes.Int32, 0>;
  onFrameState?: CodegenTypes.DirectEventHandler<FrameStateEvent>;
}

export default codegenNativeComponent<NativeProps>(
  'MaesScanPreview',
) as HostComponent<NativeProps>;
