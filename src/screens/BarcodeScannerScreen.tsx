import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LoadingView from '../components/LoadingView';
import { Theme, useTheme } from '../hooks/useTheme';
import { t } from '../i18n';
import {
  SCANNER_STATE_COLORS,
  SCANNER_STATE_LABELS,
  SCAN_PROBLEM_MESSAGES,
  scannerState,
} from '../scanner/scanner';
import type { ScanProblem } from '../scanner/scanner';
import type { ScanEntry } from '../scanner/useScanLog';
import type { Scanner } from '../scanner/useScanner';

const barcodeIcon = require('../assets/images/barcode.png');

type Props = {
  scanner: Scanner;
  /** The scanner is still powering up: only the loading logo shows. */
  starting: boolean;
  /** Why reading stopped; null while it runs. */
  problem: ScanProblem | null;
  onRetry: () => void;
  entries: ScanEntry[];
  /** Leave the scanner screen (same as Android back). */
  onBack: () => void;
  onOpenStatus: () => void;
};

/** Odoo's own purple, so the scanner belongs with the Barcode app. */
const ODOO_PURPLE = '#714B67';
const GREY = '#6B7280';
const WHITE = '#FFFFFF';
const INDICATOR_SIZE = 150;
/** The loading logo fades out over the ready screen instead of vanishing. */
export const LOADING_FADE_MS = 300;

const LEVEL_MARKS: Record<
  Exclude<ScanEntry['level'], 'pending'>,
  { mark: string; color: string }
> = {
  ok: { mark: '✓', color: '#16A34A' },
  info: { mark: '✓', color: '#16A34A' },
  sent: { mark: '✓', color: GREY },
  warning: { mark: '!', color: '#D97706' },
  error: { mark: '✕', color: '#DC2626' },
};

/**
 * The app's scanner screen, shown over Odoo while its Barcode app is open.
 * It reads continuously, no tap needed: every code goes straight to the
 * Barcode app underneath, and Odoo's answer (or complaint) shows in the list.
 */
function BarcodeScannerScreen({
  scanner,
  starting,
  problem,
  onRetry,
  entries,
  onBack,
  onOpenStatus,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // The screen renders underneath from the start; the loading logo covers it
  // and fades out once the scanner is reading.
  const [loadingShown, setLoadingShown] = useState(starting);
  const loadingOpacity = useRef(new Animated.Value(starting ? 1 : 0)).current;
  useEffect(() => {
    if (starting) {
      loadingOpacity.setValue(1);
      setLoadingShown(true);
      return;
    }
    const fade = Animated.timing(loadingOpacity, {
      toValue: 0,
      duration: LOADING_FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished) {
        setLoadingShown(false);
      }
    });
    return () => fade.stop();
  }, [starting, loadingOpacity]);

  const state = scanner.status ? scannerState(scanner.status) : null;

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.content,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            testID="scanner-back"
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={8}
            style={({ pressed }) => [
              styles.backButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <View style={styles.backChevron} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title} accessibilityRole="header">
              {t('scanner.screenTitle')}
            </Text>
            {state ? (
              <View style={styles.stateRow}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: SCANNER_STATE_COLORS[state] },
                  ]}
                />
                <Text style={styles.stateText} numberOfLines={1}>
                  {t(SCANNER_STATE_LABELS[state])}
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable
            testID="scanner-open-status"
            onPress={onOpenStatus}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [
              styles.textButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={styles.textButtonLabel}>{t('scanner.status')}</Text>
          </Pressable>
        </View>

        <View style={styles.indicatorArea}>
          <Indicator active={problem === null} />
          <Text style={styles.indicatorText} testID="scanner-message">
            {t(problem ? SCAN_PROBLEM_MESSAGES[problem] : 'scanner.aim')}
          </Text>
          {problem ? (
            <Pressable
              testID="scanner-retry"
              onPress={onRetry}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.retry,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>{t('scanner.recent')}</Text>
        <FlatList
          testID="scanner-log"
          style={styles.list}
          data={entries}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <LogRow entry={item} styles={styles} />}
          ListEmptyComponent={
            <Text style={styles.empty}>{t('scanner.emptyLog')}</Text>
          }
        />
      </View>
      {loadingShown ? (
        <Animated.View
          testID="scanner-loading"
          pointerEvents={starting ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFill, { opacity: loadingOpacity }]}
        >
          <LoadingView variant="mark" />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The scanner's "eye": purple with a pulse while reading, grey when stopped. */
function Indicator({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const color = active ? ODOO_PURPLE : GREY;
  return (
    <View style={indicatorStyles.box}>
      {active ? (
        <Animated.View
          style={[
            indicatorStyles.circle,
            indicatorStyles.ring,
            {
              borderColor: color,
              opacity: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.6, 0],
              }),
              transform: [
                {
                  scale: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.3],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      <View style={[indicatorStyles.circle, { backgroundColor: color }]}>
        <Image
          source={barcodeIcon}
          style={indicatorStyles.icon}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

function LogRow({ entry, styles }: { entry: ScanEntry; styles: Styles }) {
  const mark = entry.level === 'pending' ? null : LEVEL_MARKS[entry.level];
  const detail =
    entry.message ||
    t(entry.level === 'pending' ? 'scanner.sending' : 'scanner.sent');
  return (
    <View style={styles.row}>
      <View style={styles.mark}>
        {mark ? (
          <Text style={[styles.markText, { color: mark.color }]}>
            {mark.mark}
          </Text>
        ) : (
          <ActivityIndicator size="small" />
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.code} selectable numberOfLines={1}>
          {entry.code}
        </Text>
        <Text style={styles.detail} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <Text style={styles.time}>{new Date(entry.at).toLocaleTimeString()}</Text>
    </View>
  );
}

const indicatorStyles = StyleSheet.create({
  box: {
    width: INDICATOR_SIZE * 1.3,
    height: INDICATOR_SIZE * 1.3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    borderRadius: INDICATOR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 6,
  },
  icon: {
    width: 64,
    height: 43,
    tintColor: WHITE,
  },
});

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 4,
      paddingRight: 8,
      paddingVertical: 8,
    },
    backButton: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // A "<" drawn from two borders of a rotated square.
    backChevron: {
      width: 14,
      height: 14,
      marginLeft: 6,
      borderLeftWidth: 2.5,
      borderBottomWidth: 2.5,
      borderColor: theme.text,
      transform: [{ rotate: '45deg' }],
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.text,
    },
    stateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 6,
    },
    stateText: {
      flexShrink: 1,
      fontSize: 14,
      color: theme.textMuted,
    },
    textButton: {
      minHeight: 48,
      minWidth: 48,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textButtonLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    indicatorArea: {
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 16,
    },
    indicatorText: {
      marginTop: 8,
      paddingHorizontal: 32,
      fontSize: 15,
      textAlign: 'center',
      color: theme.text,
    },
    retry: {
      marginTop: 16,
      minHeight: 48,
      minWidth: 160,
      paddingHorizontal: 24,
      borderRadius: 24,
      borderWidth: 1.5,
      borderColor: theme.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    sectionLabel: {
      marginHorizontal: 20,
      fontSize: 13,
      fontWeight: '600',
      color: theme.textMuted,
    },
    list: {
      flex: 1,
      marginTop: 4,
    },
    empty: {
      marginHorizontal: 20,
      marginTop: 12,
      fontSize: 15,
      color: theme.textMuted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.textMuted,
    },
    mark: {
      width: 28,
      alignItems: 'center',
    },
    markText: {
      fontSize: 20,
      fontWeight: '700',
    },
    rowText: {
      flex: 1,
      marginLeft: 8,
    },
    code: {
      fontSize: 16,
      fontFamily: 'monospace',
      fontWeight: '600',
      color: theme.text,
    },
    detail: {
      marginTop: 2,
      fontSize: 13,
      color: theme.textMuted,
    },
    time: {
      marginLeft: 8,
      fontSize: 12,
      color: theme.textMuted,
    },
  });

export default BarcodeScannerScreen;
