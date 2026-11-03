import React, {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Icon from './Icon';

/** Screen push/pop and content appearing (maes-ui "Motion"). */
export const MOTION_MS = 260;

/** Fast start, long soft landing (Material's "emphasized decelerate"). */
export const EASE_OUT = Easing.bezier(0.2, 0, 0, 1);
/** Both ends soft: things that open and close in place. */
export const EASE_IN_OUT = Easing.bezier(0.4, 0, 0.2, 1);

// Read once and kept up to date: animations check it synchronously.
let reduceMotion = false;
let watching = false;
function watchReduceMotion() {
  if (watching) {
    return;
  }
  watching = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then(v => {
      reduceMotion = v;
    })
    .catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', v => {
    reduceMotion = v;
  });
}

/** The system's "remove animations" setting: fade only, no movement. */
export function isReduceMotion(): boolean {
  watchReduceMotion();
  return reduceMotion;
}

type FadeInProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Start after this many ms (staggered tiles, cards). */
  delay?: number;
  /** Rise from this many dp below; 0 for a plain fade. */
  rise?: number;
  /** Come in sideways from this many dp (negative: from the left). */
  shift?: number;
  testID?: string;
};

/** Fades (and rises) its children in once, when it mounts. */
export function FadeIn({
  children,
  style,
  delay = 0,
  rise = 12,
  shift = 0,
  testID,
}: FadeInProps) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(anim, {
      toValue: 1,
      duration: MOTION_MS,
      delay,
      easing: EASE_OUT,
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [anim, delay]);
  const still = isReduceMotion();
  const offset = still ? 0 : rise;
  const offsetX = still ? 0 : shift;
  return (
    <Animated.View
      testID={testID}
      pointerEvents="box-none"
      style={[
        style,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [offset, 0],
              }),
            },
            {
              translateX: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [offsetX, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

type CollapsibleProps = {
  open: boolean;
  children: ReactNode;
  testID?: string;
};

/**
 * Opens and closes its children in place: the height grows to the content's
 * own height while the content fades and slides down into it. The children
 * stay mounted (and measured) while closed, so opening costs no rendering.
 * Height can't run on the native driver; keep the content small (a folded
 * group of rows, not a long list).
 */
export function Collapsible({ open, children, testID }: CollapsibleProps) {
  const [height, setHeight] = useState(0);
  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const a = Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: open ? 320 : 240,
      easing: EASE_IN_OUT,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [open, anim]);
  const slide = isReduceMotion() ? 0 : -16;
  return (
    <Animated.View
      testID={testID}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.clip,
        {
          height: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, height],
          }),
        },
      ]}
    >
      <Animated.View
        onLayout={e => setHeight(e.nativeEvent.layout.height)}
        style={[
          styles.measured,
          {
            opacity: anim.interpolate({
              inputRange: [0, 0.4, 1],
              outputRange: [0, 0.6, 1],
            }),
            transform: [
              {
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [slide, 0],
                }),
              },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/** Opacity of a chevron between its turns in `FlowArrows`. */
const FLOW_DIM = 0.18;
/** Delay between one chevron lighting up and the next. */
const FLOW_STEP_MS = 140;

type FlowArrowsProps = {
  color: string;
  /** How many chevrons. */
  count?: number;
  size?: number;
  testID?: string;
};

/**
 * Chevrons that light up one after the other, left to right, over and over:
 * shows which way goods move (From › › › › To). The one looping animation
 * besides spinners (user's request, 2026-10-28); with reduced motion it is a
 * still faint-to-strong row.
 */
export function FlowArrows({
  color,
  count = 4,
  size = 18,
  testID,
}: FlowArrowsProps) {
  const values = useRef<Animated.Value[]>([]).current;
  while (values.length < count) {
    values.push(new Animated.Value(FLOW_DIM));
  }
  const still = isReduceMotion();
  // Close together, so they read as one arrow.
  const overlap = { marginLeft: -size * 0.45 };
  useEffect(() => {
    if (still) {
      return;
    }
    const step = (v: Animated.Value, toValue: number) =>
      Animated.timing(v, {
        toValue,
        duration: FLOW_STEP_MS * 2,
        easing: EASE_IN_OUT,
        useNativeDriver: true,
      });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.stagger(
          FLOW_STEP_MS,
          values
            .slice(0, count)
            .map(v => Animated.sequence([step(v, 1), step(v, FLOW_DIM)])),
        ),
        Animated.delay(FLOW_STEP_MS * 2),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [values, count, still]);
  return (
    <View
      testID={testID}
      style={styles.flow}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {values.slice(0, count).map((v, i) => (
        <Animated.View
          key={i}
          style={[
            i > 0 && overlap,
            { opacity: still ? 0.3 + (0.7 * (i + 1)) / count : v },
          ]}
        >
          <Icon name="chevron" color={color} size={size} strokeWidth={2.5} />
        </Animated.View>
      ))}
    </View>
  );
}

const BLINK_MS = 220;

type BlinkProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How often it blinks when it appears. */
  times?: number;
  testID?: string;
};

/**
 * Blinks a few times when it appears, then stays: draws the eye to it (the
 * scanner's viewfinder when the Scanner tab opens). Not a loop; still with
 * reduced motion.
 */
export function Blink({ children, style, times = 3, testID }: BlinkProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isReduceMotion()) {
      return;
    }
    const fade = (toValue: number) =>
      Animated.timing(opacity, {
        toValue,
        duration: BLINK_MS,
        easing: EASE_IN_OUT,
        useNativeDriver: true,
      });
    const blink = Animated.sequence(
      Array.from({ length: times }, () =>
        Animated.sequence([fade(0.1), fade(1)]),
      ),
    );
    blink.start();
    return () => blink.stop();
  }, [opacity, times]);
  return (
    <Animated.View
      style={[style, { opacity }]}
      pointerEvents="box-none"
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The check inside `SuccessMark` (24×24 grid) and a dash longer than it. */
const SUCCESS_CHECK = 'M7 12.5l3.2 3.2L17 9';
const SUCCESS_CHECK_LENGTH = 16;

type SuccessMarkProps = {
  /** Diameter of the filled circle; the halo and ripple grow around it. */
  size: number;
  /** Circle and ripple. */
  color: string;
  /** Halo behind the circle. */
  soft: string;
  /** The check. */
  onColor: string;
  testID?: string;
};

/**
 * "Done" moment (a validated transfer): the circle springs in on a soft halo,
 * the check draws itself and one ripple runs out. Plays once, never loops;
 * with reduced motion it is simply there.
 */
export function SuccessMark({
  size,
  color,
  soft,
  onColor,
  testID,
}: SuccessMarkProps) {
  const still = isReduceMotion();
  const pop = useRef(new Animated.Value(still ? 1 : 0)).current;
  const draw = useRef(new Animated.Value(still ? 1 : 0)).current;
  const ripple = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) {
      return;
    }
    const a = Animated.parallel([
      Animated.spring(pop, {
        toValue: 1,
        speed: 12,
        bounciness: 9,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(draw, {
          toValue: 1,
          duration: 380,
          easing: EASE_OUT,
          useNativeDriver: false,
        }),
      ]),
      Animated.sequence([
        Animated.delay(140),
        Animated.timing(ripple, {
          toValue: 1,
          duration: 1000,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ]),
    ]);
    a.start();
    return () => a.stop();
  }, [still, pop, draw, ripple]);
  const halo = size * 1.45;
  const box = size * 2;
  const circle = (d: number) => ({ width: d, height: d, borderRadius: d / 2 });
  return (
    <View
      testID={testID}
      style={[styles.successBox, { width: box, height: box }]}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[
          styles.successLayer,
          circle(size),
          styles.successRing,
          {
            borderColor: color,
            opacity: ripple.interpolate({
              inputRange: [0, 0.15, 1],
              outputRange: [0, 0.45, 0],
            }),
            transform: [
              {
                scale: ripple.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 2],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.successLayer,
          circle(halo),
          { backgroundColor: soft, transform: [{ scale: pop }] },
        ]}
      />
      <Animated.View
        style={[
          styles.successLayer,
          circle(size),
          {
            backgroundColor: color,
            transform: [
              {
                scale: pop.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 1],
                }),
              },
            ],
            opacity: pop.interpolate({
              inputRange: [0, 0.3, 1],
              outputRange: [0, 1, 1],
              extrapolate: 'clamp',
            }),
          },
        ]}
      >
        <Svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24">
          <AnimatedPath
            d={SUCCESS_CHECK}
            fill="none"
            stroke={onColor}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={SUCCESS_CHECK_LENGTH}
            strokeDashoffset={draw.interpolate({
              inputRange: [0, 1],
              outputRange: [SUCCESS_CHECK_LENGTH, 0],
            })}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressScaleProps = React.ComponentProps<typeof Pressable> & {
  /** Style for the current pressed state; the scale is added to it. */
  pressStyle: (pressed: boolean) => StyleProp<ViewStyle>;
  /** How far it sinks while held. */
  to?: number;
};

/** A Pressable that sinks a little while held and springs back on release. */
export function PressScale({
  pressStyle,
  to = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}: PressScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const springTo = useCallback(
    (value: number) =>
      Animated.spring(scale, {
        toValue: value,
        speed: 40,
        bounciness: value === 1 ? 6 : 0,
        useNativeDriver: true,
      }).start(),
    [scale],
  );
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={e => {
        setPressed(true);
        springTo(to);
        onPressIn?.(e);
      }}
      onPressOut={e => {
        setPressed(false);
        springTo(1);
        onPressOut?.(e);
      }}
      style={[pressStyle(pressed), { transform: [{ scale }] }]}
    />
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  flow: { flexDirection: 'row', alignItems: 'center' },
  measured: { position: 'absolute', left: 0, right: 0, top: 0 },
  successBox: { alignItems: 'center', justifyContent: 'center' },
  successRing: { borderWidth: 2 },
  successLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
