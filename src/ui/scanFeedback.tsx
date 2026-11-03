import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { t } from '../i18n';
import { ScanPreview } from '../scanner/ScanPreview';
import Icon, { IconName } from './Icon';
import { Blink } from './motion';
import { Tone, toneColors, useUi } from './theme';

/** Short double buzz for a rejected scan (the accept beep comes from the scanner). */
export function rejectFeedback() {
  Vibration.vibrate([0, 70, 60, 70]);
}

/** What the scanner is doing, as the screens show it. */
export type ScannerUiState = 'starting' | 'ready' | 'problem' | 'unavailable';

/**
 * The scanner stopped reading (repeated failures, permission...): what
 * happened and Try again. Shown at the bottom of a scanning screen.
 */
export function ScanProblemNotice({
  text,
  onRetry,
}: {
  text: string;
  onRetry: () => void;
}) {
  const { c, s, r, type } = useUi();
  return (
    <View
      style={[
        styles.notice,
        {
          backgroundColor: c.dangerSoft,
          borderColor: c.danger,
          borderRadius: r.md,
          marginHorizontal: s.lg,
          marginBottom: s.sm,
          paddingLeft: s.md,
          paddingVertical: s.xs,
          paddingRight: s.xs,
        },
      ]}
      testID="scan-problem"
    >
      <Icon name="error" color={c.danger} size={20} />
      <Text
        style={[type.label, styles.fill, { color: c.text, marginLeft: s.sm }]}
        numberOfLines={2}
        testID="scan-problem-text"
      >
        {text}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        hitSlop={8}
        testID="scan-problem-retry"
        style={({ pressed }) => [
          styles.pill,
          {
            borderRadius: r.pill,
            backgroundColor: pressed ? c.border : c.surface,
          },
        ]}
      >
        <Text style={[type.label, { color: c.text }]}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  );
}

/** The opening that shows the scanner's picture: a bit larger than a barcode label. */
const VIEWFINDER_WIDTH = 280;
const VIEWFINDER_HEIGHT = 170;

type ScanWindowProps = {
  state: ScannerUiState;
  /** A scan is being looked up. */
  busy?: boolean;
  /** Shown when the scanner has a problem. */
  problemText?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * The scanner, filling the space it is given edge to edge: black, with a viewfinder in the
 * middle (red outline) that shows what the handheld's scan engine sees, so the
 * user knows it is reading and where it points. Without a scanner (a plain
 * phone) it says no scanner is connected.
 */
export function ScanWindow({
  state,
  busy = false,
  problemText,
  onRetry,
  style,
}: ScanWindowProps) {
  const { c, s, r, type } = useUi();
  const [live, setLive] = useState(false);

  const connected = state !== 'unavailable';
  const reading = connected && live && state !== 'problem';
  const dot = reading ? c.success : state === 'problem' ? c.danger : c.warning;
  const label = !connected
    ? t('scanner.preview.none')
    : reading
    ? t('scanner.preview.live')
    : state === 'starting'
    ? t('scanner.preview.starting')
    : state === 'problem'
    ? problemText ?? t('scanner.problem.error')
    : t('scanner.preview.waiting');

  return (
    <View
      style={[styles.window, { backgroundColor: c.media }, style]}
      testID="scan-window"
    >
      <View
        style={[styles.viewfinder, { borderRadius: r.md }]}
        accessible
        accessibilityLabel={label}
        testID="scan-viewfinder"
      >
        {connected ? (
          <ScanPreview style={StyleSheet.absoluteFill} onLiveChange={setLive} />
        ) : null}
        {reading ? (
          <View
            style={[styles.aimLine, { backgroundColor: c.scanFrame }]}
            pointerEvents="none"
          />
        ) : (
          <View style={styles.windowCover} pointerEvents="none">
            {state === 'starting' ? (
              <ActivityIndicator color={c.onMedia} size="large" />
            ) : (
              <Icon name="scan" color={c.onMedia} size={56} />
            )}
          </View>
        )}
        {/* The red outline blinks when the scanner opens: here is the picture. */}
        <Blink
          style={[
            styles.viewfinderFrame,
            { borderRadius: r.md, borderColor: c.scanFrame },
          ]}
          testID="scan-viewfinder-frame"
        />
      </View>
      {!connected || state === 'problem' ? (
        <Text
          style={[
            type.bodyStrong,
            styles.center,
            { color: c.onMedia, marginTop: s.lg, marginHorizontal: s.xl },
          ]}
          testID="scan-window-message"
        >
          {label}
        </Text>
      ) : null}
      {state === 'problem' && onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          testID="scan-window-retry"
          style={({ pressed }) => [
            styles.windowRetry,
            {
              borderRadius: r.pill,
              borderColor: c.onMedia,
              marginTop: s.lg,
              paddingHorizontal: s.xl,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[type.label, { color: c.onMedia }]}>
            {t('common.retry')}
          </Text>
        </Pressable>
      ) : null}
      {connected && state !== 'problem' ? (
        <View
          style={[
            styles.windowBadge,
            {
              top: s.md,
              left: s.md,
              borderRadius: r.pill,
              backgroundColor: c.overlay,
              paddingHorizontal: s.sm,
              paddingVertical: s.xs,
            },
          ]}
          pointerEvents="none"
        >
          <View style={[styles.windowDot, { backgroundColor: dot }]} />
          <Text
            style={[type.caption, { color: c.onMedia, marginLeft: s.xs }]}
            numberOfLines={1}
            testID="scan-window-text"
          >
            {label}
          </Text>
        </View>
      ) : null}
      {busy ? (
        <ActivityIndicator
          color={c.onMedia}
          style={[styles.windowBusy, { top: s.md, right: s.md }]}
          testID="scan-window-busy"
        />
      ) : null}
    </View>
  );
}

export type ScanMessage = {
  /** Changes for every new message, so the same text shows again. */
  id: number;
  tone: Tone;
  text: string;
};

const TONE_ICONS: Record<Tone, IconName> = {
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'scan',
  neutral: 'scan',
  accent: 'scan',
};

const SHOW_MS = 2600;

/**
 * The answer to the latest scan, sliding in at the bottom. Render it
 * inside the screen's content area, bottom-aligned.
 */
export function ScanToast({ message }: { message: ScanMessage | null }) {
  const { c, s, r, type } = useUi();
  const anim = useRef(new Animated.Value(0)).current;
  const bump = useRef(new Animated.Value(1)).current;
  const visibleRef = useRef(false);
  const [shown, setShown] = useState<ScanMessage | null>(null);

  useEffect(() => {
    if (!message) {
      return;
    }
    setShown(message);
    if (visibleRef.current) {
      // Scans in quick succession: swap the text in place with a bump,
      // instead of hiding and sliding the toast in again for every one. Big
      // enough to see that a new answer came, even with the same text.
      bump.setValue(0.88);
      Animated.spring(bump, {
        toValue: 1,
        speed: 30,
        bounciness: 12,
        useNativeDriver: true,
      }).start();
    } else {
      anim.setValue(0);
    }
    visibleRef.current = true;
    const seq = Animated.sequence([
      Animated.timing(anim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(message.tone === 'danger' ? SHOW_MS + 1200 : SHOW_MS),
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]);
    seq.start(({ finished }) => {
      if (finished) {
        visibleRef.current = false;
        setShown(null);
      }
    });
    return () => seq.stop();
  }, [message, anim, bump]);

  if (!shown) {
    return null;
  }
  const tone = toneColors(c, shown.tone);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      testID="scan-toast"
      style={[
        styles.toast,
        {
          left: s.lg,
          right: s.lg,
          bottom: s.md,
          borderRadius: r.md,
          backgroundColor: c.surface,
          borderColor: tone.fg,
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
            { scale: bump },
          ],
        },
      ]}
    >
      <View
        style={[
          styles.toastIcon,
          { backgroundColor: tone.bg, borderRadius: r.sm, marginRight: s.md },
        ]}
      >
        <Icon name={TONE_ICONS[shown.tone]} color={tone.fg} size={20} />
      </View>
      <Text
        style={[type.bodyStrong, styles.fill, { color: c.text }]}
        numberOfLines={3}
        testID="scan-toast-text"
      >
        {shown.text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pill: { paddingHorizontal: 12, height: 40, justifyContent: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  window: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinder: {
    width: VIEWFINDER_WIDTH,
    height: VIEWFINDER_HEIGHT,
    maxWidth: '85%',
    overflow: 'hidden',
  },
  viewfinderFrame: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 2,
  },
  windowCover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aimLine: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    top: '50%',
    height: 2,
    opacity: 0.6,
  },
  windowBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '70%',
  },
  windowDot: { width: 8, height: 8, borderRadius: 4 },
  windowRetry: {
    height: 48,
    justifyContent: 'center',
    borderWidth: 1,
  },
  windowBusy: { position: 'absolute' },
  center: { textAlign: 'center' },
  toast: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    elevation: 4,
  },
  toastIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
