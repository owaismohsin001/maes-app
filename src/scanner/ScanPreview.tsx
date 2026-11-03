import React from 'react';
import { Platform } from 'react-native';
import type { ViewProps } from 'react-native';
import MaesScanPreview from '../native/MaesScanPreviewNativeComponent';

/**
 * Clockwise turn (degrees) that shows the scan engine's picture upright on the
 * handheld. The module's mounting decides it: check on the device.
 */
export const PREVIEW_ROTATION = 0;

type Props = ViewProps & {
  /** Frames started (true) or stopped (false) arriving. */
  onLiveChange: (live: boolean) => void;
};

/**
 * The live picture of the handheld's scan engine, while it reads. Nothing off
 * Android; empty (transparent) until the first frame.
 */
export function ScanPreview({ onLiveChange, ...rest }: Props) {
  if (Platform.OS !== 'android') {
    return null;
  }
  return (
    <MaesScanPreview
      {...rest}
      imageRotation={PREVIEW_ROTATION}
      onFrameState={event => onLiveChange(event.nativeEvent.live)}
    />
  );
}
