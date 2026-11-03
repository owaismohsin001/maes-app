import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Easing,
  Linking,
  Platform,
  StyleSheet,
  ToastAndroid,
} from 'react-native';
import { t } from '../i18n';
import { SCAN_PROBLEM_MESSAGES, scannerState } from '../scanner/scanner';
import type { ScanProblem } from '../scanner/scanner';
import { useLiveScanning } from '../scanner/useLiveScanning';
import type { ScanEntry } from '../scanner/useScanLog';
import BarcodeScannerScreen from '../screens/BarcodeScannerScreen';
import ScannerStatusScreen from '../screens/ScannerStatusScreen';

type Props = {
  /** Show the scanner screen: Odoo's Barcode app is open underneath. */
  open: boolean;
  /** On the way out of the Barcode app: still shown, but no longer reading. */
  leaving?: boolean;
  /** Back from the scanner screen: leave the Barcode app. */
  onBack: () => void;
  /**
   * A code read: typed into the Odoo page. Returns the scan log id when the
   * page gets to answer it (the entry in `entries` leaves 'pending' then).
   */
  onCode: (code: string) => string | void;
  /** The codes sent to Odoo and its answers, newest first. */
  entries: ScanEntry[];
};

/** Fade/slide in and out, so the screen doesn't jump over Odoo's. */
export const SCANNER_ENTER_MS = 240;
export const SCANNER_EXIT_MS = 180;

function notify(problem: ScanProblem) {
  if (problem === 'permissionBlocked') {
    Alert.alert(
      t('scanner.cameraBlockedTitle'),
      t('scanner.cameraBlockedBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('scanner.openSettings'),
          onPress: () => {
            Linking.openSettings().catch(() => {});
          },
        },
      ],
    );
    return;
  }
  if (Platform.OS === 'android') {
    ToastAndroid.show(t(SCAN_PROBLEM_MESSAGES[problem]), ToastAndroid.SHORT);
  }
}

/**
 * The app's scanner screen over Odoo's Barcode app. While `open`, the
 * handheld reads continuously and every code is typed into Odoo's page
 * underneath (`onCode`), which does everything else: Odoo's own Barcode app
 * is the Barcode app. A read is held until Odoo has answered it (its
 * notification shows in the screen's list), then the next read starts.
 * Otherwise the side scan button still works on any Odoo screen. Not a
 * `Modal` on purpose: a modal is its own Android window, and key events (the
 * side button) would not reach MainActivity. Renders nothing where the
 * scanner module doesn't exist (iOS), which keeps Odoo's own Barcode app there.
 */
function ScannerOverlay({
  open,
  leaving = false,
  onBack,
  onCode,
  entries,
}: Props) {
  const [statusOpen, setStatusOpen] = useState(false);
  const statusOpenRef = useRef(statusOpen);
  statusOpenRef.current = statusOpen;
  const openRef = useRef(open);
  openRef.current = open;
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  // The live read whose answer from Odoo is awaited.
  const waitingForRef = useRef<string | null>(null);

  const deliver = useCallback((code: string) => {
    if (statusOpenRef.current) {
      return; // test scans: shown on the status screen only
    }
    const id = onCodeRef.current(code);
    if (openRef.current && typeof id === 'string') {
      waitingForRef.current = id;
      return true;
    }
  }, []);
  const { scanner, starting, problem, restart, resume } = useLiveScanning({
    live: open && !statusOpen && !leaving,
    onCode: deliver,
    notify,
  });

  // Odoo answered the held read (or the log gave up waiting): read on.
  useEffect(() => {
    const id = waitingForRef.current;
    if (id === null) {
      return;
    }
    const entry = entries.find(e => e.id === id);
    if (!entry || entry.level !== 'pending') {
      waitingForRef.current = null;
      resume();
    }
  }, [entries, resume]);

  // Stays mounted while it animates out.
  const [mounted, setMounted] = useState(open);
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(appear, {
        toValue: 1,
        duration: SCANNER_ENTER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mountedRef.current) {
      Animated.timing(appear, {
        toValue: 0,
        duration: SCANNER_EXIT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMounted(false);
        }
      });
    }
  }, [open, appear]);

  const openStatus = useCallback(() => setStatusOpen(true), []);
  const closeStatus = useCallback(() => setStatusOpen(false), []);

  // The status screen belongs to the scanner screen.
  useEffect(() => {
    if (!open) {
      setStatusOpen(false);
      waitingForRef.current = null;
    }
  }, [open]);

  // Android back: status screen → scanner screen → out of the Barcode app.
  // Registered while open, so it runs before the WebView's.
  useEffect(() => {
    if (!open) {
      return;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (statusOpenRef.current) {
          setStatusOpen(false);
        } else {
          onBackRef.current();
        }
        return true;
      },
    );
    return () => subscription.remove();
  }, [open]);

  if (!scanner.supported || !mounted) {
    return null;
  }
  if (scanner.status && scannerState(scanner.status) === 'unavailable') {
    return null; // a phone without the scanner: Odoo's own Barcode app shows
  }

  return (
    <Animated.View
      testID="scanner-overlay"
      pointerEvents={open ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: appear,
          transform: [
            {
              translateY: appear.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
          ],
        },
      ]}
    >
      <BarcodeScannerScreen
        scanner={scanner}
        starting={starting}
        problem={problem}
        onRetry={restart}
        entries={entries}
        onBack={onBack}
        onOpenStatus={openStatus}
      />
      {statusOpen ? (
        <Animated.View style={StyleSheet.absoluteFill}>
          <ScannerStatusScreen scanner={scanner} onClose={closeStatus} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export default ScannerOverlay;
