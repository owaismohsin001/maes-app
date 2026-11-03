import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import {
  LOGO_RING,
  LOGO_RING_DIAMETER,
  LOGO_SIZE,
  logoM,
  logoWithoutRing,
} from '../assets/logo';
import { useTheme } from '../hooks/useTheme';
import { t } from '../i18n';

export type LogoSpinnerVariant = 'mark' | 'full';

type Props = {
  /**
   * `mark` (default): only the "M" inside its ring.
   * `full`: the whole logo, with the ring around its "M" spinning.
   */
  variant?: LogoSpinnerVariant;
  /**
   * Diameter of the spinning ring, in dp. The `full` logo is sized from it
   * (width ≈ 2.43 × size), so the ring is the same for both variants.
   */
  size?: number;
  /** Logo and ring colour. Defaults to the theme's brand ink (black / white). */
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** Screen-reader text. Defaults to the translated "Loading…". */
  accessibilityLabel?: string;
  testID?: string;
};

export const LOGO_SPINNER_DEFAULT_SIZE = 56;
const SPIN_DURATION_MS = 1100; // same pace as the splash
const MIN_STROKE_DP = 1.5; // the brand stroke gets hairline-thin below ~60 dp

/** The spinning ring from the splash screen, on the "M" alone or on the full logo. */
function LogoSpinner({
  variant = 'mark',
  size = LOGO_SPINNER_DEFAULT_SIZE,
  color,
  style,
  accessibilityLabel,
  testID = 'logo-spinner',
}: Props) {
  const theme = useTheme();
  const ink = color ?? theme.logo;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: SPIN_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // dp per source px, so that the ring is exactly `size` wide.
  const scale = size / LOGO_RING_DIAMETER;
  const frame =
    variant === 'mark'
      ? { width: size, height: size, ringLeft: 0, ringTop: 0 }
      : {
          width: LOGO_SIZE.width * scale,
          height: LOGO_SIZE.height * scale,
          ringLeft: (LOGO_RING.cx - LOGO_RING.rOuter) * scale,
          ringTop: (LOGO_RING.cy - LOGO_RING.rOuter) * scale,
        };

  return (
    <View
      style={[{ width: frame.width, height: frame.height }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? t('common.loading')}
      accessibilityState={{ busy: true }}
      testID={testID}
    >
      <Image
        source={variant === 'mark' ? logoM : logoWithoutRing}
        resizeMode="contain"
        fadeDuration={0}
        style={{ width: frame.width, height: frame.height, tintColor: ink }}
      />
      <Animated.View
        testID={`${testID}-ring`}
        style={[
          styles.ring,
          {
            left: frame.ringLeft,
            top: frame.ringTop,
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: Math.max(MIN_STROKE_DP, LOGO_RING.stroke * scale),
            borderColor: ink,
            transform: [{ rotate }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderTopColor: 'transparent',
  },
});

export default LogoSpinner;
