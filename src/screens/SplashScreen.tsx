import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

// The logo with the ring around the "M" erased; the ring is drawn below as a
// spinner in exactly the same place (geometry shared with `LogoSpinner`).
import {
  LOGO_RING as RING,
  LOGO_SIZE as SRC,
  logoWithoutRing as logoMark,
} from '../assets/logo';

const LOGO_WIDTH = 240;
const SCALE = LOGO_WIDTH / SRC.width;
const LOGO_HEIGHT = SRC.height * SCALE;
const RING_SIZE = 2 * RING.rOuter * SCALE;

/** Minimum time on screen before the fade-out starts. */
export const SPLASH_DURATION_MS = 2800;
/** Leave anyway after this long if `ready` never comes (no network etc.). */
export const SPLASH_MAX_WAIT_MS = 20000;
const RING_COMPLETE_MS = 350; // the spinner closes into the full logo ring just before the exit
const EXIT_DURATION_MS = 450;

// Brand splash: fixed light theme regardless of the system colour scheme.
const colors = {
  background: '#FFFFFF',
  logo: '#000000',
};

type Props = {
  onFinish: () => void;
  /**
   * Whether what is behind the splash has loaded. The spinner keeps turning
   * until it is, so the app appears fully loaded, with no second loader.
   */
  ready?: boolean;
  /** Minimum time on screen before the fade-out starts. */
  durationMs?: number;
  /** Fade out after this long even if `ready` never comes. */
  maxWaitMs?: number;
};

function SplashScreen({
  onFinish,
  ready = true,
  durationMs = SPLASH_DURATION_MS,
  maxWaitMs = SPLASH_MAX_WAIT_MS,
}: Props) {
  // Keep the latest callback without restarting the animation when the parent re-renders.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const screenOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.88)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const ringComplete = useRef(new Animated.Value(0)).current;

  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const leaving = (minElapsed && ready) || timedOut;

  // Intro, then the ring spins for as long as the splash is up.
  useEffect(() => {
    const spinner = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const intro = Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 7,
        tension: 50,
        useNativeDriver: true,
      }),
    ]);

    spinner.start();
    intro.start();
    const minTimer = setTimeout(
      () => setMinElapsed(true),
      Math.max(durationMs - RING_COMPLETE_MS, 0),
    );
    const maxTimer = setTimeout(
      () => setTimedOut(true),
      Math.max(maxWaitMs - RING_COMPLETE_MS, 0),
    );

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
      spinner.stop();
      intro.stop();
    };
  }, [durationMs, maxWaitMs, logoOpacity, logoScale, spin]);

  // Ready: the spinner closes into the full logo ring, then the splash fades out.
  useEffect(() => {
    if (!leaving) {
      return;
    }
    const complete = Animated.timing(ringComplete, {
      toValue: 1,
      duration: RING_COMPLETE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const exit = Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: EXIT_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1.06,
        duration: EXIT_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    complete.start();
    const exitTimer = setTimeout(() => {
      spin.stopAnimation();
      exit.start(({ finished }) => {
        if (finished) {
          onFinishRef.current();
        }
      });
    }, RING_COMPLETE_MS);

    return () => {
      clearTimeout(exitTimer);
      complete.stop();
      exit.stop();
    };
  }, [leaving, logoScale, ringComplete, screenOpacity, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const spinnerOpacity = ringComplete.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <Animated.View
        style={[
          styles.logoWrap,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <Animated.Image
          source={logoMark}
          resizeMode="contain"
          fadeDuration={0}
          accessibilityRole="image"
          accessibilityLabel="MAES Security"
          style={styles.logo}
        />
        {/* The logo's ring, spinning while the app loads… */}
        <Animated.View
          style={[
            styles.ring,
            styles.spinner,
            { opacity: spinnerOpacity, transform: [{ rotate }] },
          ]}
        />
        {/* …then closing into the complete logo. */}
        <Animated.View style={[styles.ring, { opacity: ringComplete }]} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
  ring: {
    position: 'absolute',
    left: (RING.cx - RING.rOuter) * SCALE,
    top: (RING.cy - RING.rOuter) * SCALE,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING.stroke * SCALE,
    borderColor: colors.logo,
  },
  spinner: {
    borderTopColor: 'transparent',
  },
});

export default SplashScreen;
