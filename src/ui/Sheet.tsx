import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { t } from '../i18n';
import { EASE_OUT } from './motion';
import { useUi } from './theme';

type Props = {
  visible: boolean;
  /** Backdrop tap and Android back. */
  onClose: () => void;
  title: string;
  /** One sentence under the title. */
  message?: string;
  children?: ReactNode;
  testID?: string;
};

const ENTER_MS = 300;
const EXIT_MS = 200;

/**
 * Bottom sheet inside the current screen. Deliberately not a `Modal`: a modal
 * is its own Android window and the side scan button's key events would not
 * reach MainActivity. Render it last in its screen so it sits on top.
 */
function Sheet({ visible, onClose, title, message, children, testID }: Props) {
  const { c, s, r, type } = useUi();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  // Slides in from fully below the screen edge, however tall it is.
  const [panelHeight, setPanelHeight] = useState(480);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: ENTER_MS,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => finished && setMounted(false));
  }, [visible, progress]);

  // Registered last, so it runs before the screen's own back handling.
  useEffect(() => {
    if (!visible) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCloseRef.current();
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  if (!mounted) {
    return null;
  }
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={visible ? 'auto' : 'none'}
      testID={testID}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: c.overlay, opacity: progress },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          {
            backgroundColor: c.surface,
            borderTopLeftRadius: r.lg,
            borderTopRightRadius: r.lg,
            paddingHorizontal: s.lg,
            paddingTop: s.sm,
            paddingBottom: insets.bottom + s.lg + keyboard,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [panelHeight, 0],
                }),
              },
            ],
          },
        ]}
        accessibilityViewIsModal
        onLayout={e => setPanelHeight(e.nativeEvent.layout.height)}
      >
        <View style={[styles.grip, { backgroundColor: c.border }]} />
        <Text
          style={[type.title, { color: c.text, marginTop: s.md }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {message ? (
          <Text style={[type.body, { color: c.textMuted, marginTop: s.sm }]}>
            {message}
          </Text>
        ) : null}
        <View style={{ marginTop: s.lg, gap: s.sm }}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
});

export default Sheet;
