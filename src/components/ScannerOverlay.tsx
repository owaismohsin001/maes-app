import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import BarcodeNavigator, {
  BarcodeNavigatorHandle,
} from '../navigation/BarcodeNavigator';
import type { ScannerInfo } from '../navigation/barcodeContext';
import { SCAN_PROBLEM_MESSAGES, scannerState } from '../scanner/scanner';
import type { ScanProblem } from '../scanner/scanner';
import { useLiveScanning } from '../scanner/useLiveScanning';
import ScannerStatusScreen from '../screens/ScannerStatusScreen';

type Props = {
  /** Show the app's Barcode screens: Odoo's Barcode app is open. */
  open: boolean;
  /** On the way out of the Barcode app: still shown, but no longer reading. */
  leaving?: boolean;
  /** Back from the first screen: leave the Barcode app. */
  onBack: () => void;
  /** A code read while the screens are closed (side button on Odoo's screens). */
  onCode: (code: string) => void;
  /** Show a page of the Odoo web client (e.g. a wizard the app can't show). */
  onOpenOdoo: (path: string) => void;
  /** The Odoo session ended: sign in again in the web client. */
  onSignIn: () => void;
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
 * The app's own Barcode app over the Odoo screen. While `open`, its native
 * screens (`BarcodeNavigator`) cover Odoo and the handheld reads
 * continuously, every code going to the screen on top; otherwise the side
 * scan button still works on any Odoo screen (`onCode`). Not a `Modal` on
 * purpose: a modal is its own Android window, and key events (the side
 * button) would not reach MainActivity. Renders nothing where the scanner
 * module doesn't exist (iOS), which keeps Odoo's own Barcode app there.
 */
function ScannerOverlay({
  open,
  leaving = false,
  onBack,
  onCode,
  onOpenOdoo,
  onSignIn,
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
  const navigatorRef = useRef<BarcodeNavigatorHandle>(null);

  const deliver = useCallback((code: string) => {
    if (statusOpenRef.current) {
      return; // test scans: shown on the status screen only
    }
    if (openRef.current) {
      navigatorRef.current?.deliver(code);
    } else {
      onCodeRef.current(code);
    }
  }, []);
  const deliverRepeat = useCallback((code: string) => {
    if (openRef.current && !statusOpenRef.current) {
      navigatorRef.current?.deliver(code, true);
    }
  }, []);
  const { scanner, starting, problem, restart } = useLiveScanning({
    live: open && !statusOpen && !leaving,
    onCode: deliver,
    onRepeat: deliverRepeat,
    notify,
  });

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

  // The status screen belongs to the Barcode screens.
  useEffect(() => {
    if (!open) {
      setStatusOpen(false);
    }
  }, [open]);

  // Android back: status screen → the Barcode screens' own stack → out of
  // the Barcode app. Registered while open, so it runs before the WebView's.
  useEffect(() => {
    if (!open) {
      return;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (statusOpenRef.current) {
          setStatusOpen(false);
        } else if (!navigatorRef.current?.back()) {
          onBackRef.current();
        }
        return true;
      },
    );
    return () => subscription.remove();
  }, [open]);

  const status = scanner.status ? scannerState(scanner.status) : null;
  const scannerInfo = useMemo<ScannerInfo>(
    () => ({
      state:
        status === 'unavailable'
          ? 'unavailable'
          : problem
          ? 'problem'
          : starting || status === null
          ? 'starting'
          : 'ready',
      problemText: problem ? t(SCAN_PROBLEM_MESSAGES[problem]) : undefined,
      restart,
    }),
    [status, problem, starting, restart],
  );

  if (!scanner.supported || !mounted) {
    return null;
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
      <BarcodeNavigator
        ref={navigatorRef}
        scanner={scannerInfo}
        onExit={onBack}
        onOpenOdoo={onOpenOdoo}
        onSignIn={onSignIn}
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
