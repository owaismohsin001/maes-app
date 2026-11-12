import { useRef } from 'react';
import { Alert, Linking, Platform, ToastAndroid } from 'react-native';
import { t } from '../i18n';
import { SCAN_PROBLEM_MESSAGES, nativeScanner } from './scanner';
import type { ScanProblem } from './scanner';
import { useScanner } from './useScanner';

/** A read that ended without a code: a short Android notice (or the way to Settings). */
export function notifyScanProblem(problem: ScanProblem) {
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
 * The handheld's CM60 scanner feeding the Odoo page: one press of the side
 * scan button = one read; the code beeps and goes to `deliver`, which types it
 * into the page like a keyboard-wedge scanner. Odoo's own screen shows the rest.
 * While `enabled` is false (the app is locked) reads are dropped.
 */
export function useHandheldScanner(
  deliver: (code: string) => void,
  enabled = true,
) {
  const deliverRef = useRef(deliver);
  deliverRef.current = deliver;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  useScanner({
    onCode: code => {
      // Locked app (app control): no beep, nothing typed into the hidden page.
      if (!enabledRef.current) {
        return;
      }
      nativeScanner?.feedback();
      deliverRef.current(code);
    },
    onProblem: notifyScanProblem,
  });
}
