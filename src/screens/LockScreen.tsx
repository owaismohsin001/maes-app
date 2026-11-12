import React, { useEffect } from 'react';
import {
  BackHandler,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LogoSpinner from '../components/LogoSpinner';
import { BRAND } from '../config';
import type { AppControl, LockReason } from '../control/useAppControl';
import { useTheme } from '../hooks/useTheme';
import { t, type TranslationKey } from '../i18n';

const TEXTS: Record<LockReason, { title: TranslationKey; body: TranslationKey }> = {
  pending: { title: 'control.pending.title', body: 'control.pending.body' },
  blocked: { title: 'control.blocked.title', body: 'control.blocked.body' },
  app_disabled: {
    title: 'control.disabled.title',
    body: 'control.disabled.body',
  },
  outside_location: {
    title: 'control.outside.title',
    body: 'control.outside.body',
  },
  no_location: {
    title: 'control.noLocation.title',
    body: 'control.noLocation.body',
  },
  mock_location: { title: 'control.mock.title', body: 'control.mock.body' },
  unknown_brand: {
    title: 'control.unknown.title',
    body: 'control.unknown.body',
  },
  offline: { title: 'control.offline.title', body: 'control.offline.body' },
  unsupported: {
    title: 'control.unsupported.title',
    body: 'control.unsupported.body',
  },
};

/** 140 → "140 m", 2345 → "2.3 km" (nl: "2,3 km"). */
export function formatDistance(metres: number): string {
  if (metres < 1000) {
    return `${Math.round(metres)} m`;
  }
  const km = (metres / 1000).toFixed(metres < 10000 ? 1 : 0);
  return `${t('control.decimal') === ',' ? km.replace('.', ',') : km} km`;
}

/** The body text of a lock, with the place / distance filled in. */
export function lockBody(control: AppControl): string {
  const reason = control.reason ?? 'offline';
  const { answer } = control;
  if (reason === 'outside_location') {
    const place = answer?.locationName || t('control.outside.place');
    let body = t('control.outside.body').replace('%s', place);
    if (answer?.distanceM != null) {
      body += `\n${t('control.outside.distance').replace(
        '%s',
        formatDistance(answer.distanceM),
      )}`;
    }
    return body;
  }
  if (reason === 'no_location' && control.permission !== 'granted') {
    return t('control.noLocation.permissionBody');
  }
  return t(TEXTS[reason].body);
}

type Props = { control: AppControl };

/**
 * Covers Odoo while the app may not run on this device (odoo19Module §P450):
 * why, the device code the administrator looks for in Odoo, and what the user
 * can do (try again, allow location, open the location settings). Android
 * back closes the app instead of moving through the hidden Odoo pages.
 */
function LockScreen({ control }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        BackHandler.exitApp();
        return true;
      },
    );
    return () => subscription.remove();
  }, []);

  if (control.phase === 'checking') {
    return (
      <View
        testID="lock-screen"
        style={[styles.fill, styles.center, { backgroundColor: theme.background }]}
      >
        <LogoSpinner variant="mark" size={72} />
        <Text style={[styles.checking, { color: theme.textMuted }]}>
          {t('control.checking')}
        </Text>
      </View>
    );
  }

  const reason = control.reason ?? 'offline';
  const code = control.answer?.deviceCode;
  const needsPermission =
    reason === 'no_location' && control.permission !== 'granted';
  const permissionBlocked = needsPermission && control.permission === 'blocked';
  const locationOff = reason === 'no_location' && control.locationStatus === 'off';

  const openSettings = () => {
    if (locationOff && Platform.OS === 'android') {
      Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(
        () => Linking.openSettings().catch(() => {}),
      );
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  return (
    <View
      testID="lock-screen"
      accessibilityViewIsModal
      style={[
        styles.fill,
        styles.center,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <Image
        source={BRAND.logo.full}
        resizeMode="contain"
        style={[styles.logo, { tintColor: theme.logo }]}
        accessibilityLabel={BRAND.companyName}
      />
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t(TEXTS[reason].title)}
      </Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>
        {lockBody(control)}
      </Text>
      {code ? (
        <Text testID="device-code" style={[styles.code, { color: theme.text }]}>
          {t('control.deviceCode').replace('%s', code)}
        </Text>
      ) : null}

      {needsPermission && !permissionBlocked ? (
        <Button
          testID="lock-allow-location"
          label={t('control.allowLocation')}
          onPress={control.recheck}
          disabled={control.busy}
          primary
        />
      ) : null}
      {permissionBlocked || locationOff ? (
        <Button
          testID="lock-open-settings"
          label={t('scanner.openSettings')}
          onPress={openSettings}
          primary
        />
      ) : null}
      <Button
        testID="lock-retry"
        label={control.busy ? t('control.checkingShort') : t('common.retry')}
        onPress={control.recheck}
        disabled={control.busy}
      />
    </View>
  );
}

function Button({
  testID,
  label,
  onPress,
  disabled = false,
  primary = false,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: theme.text, borderColor: theme.text }
          : { borderColor: theme.text },
        { opacity: disabled ? 0.5 : pressed ? 0.6 : 1 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: primary ? theme.background : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 160,
    height: 96,
    marginBottom: 32,
  },
  checking: {
    marginTop: 16,
    fontSize: 15,
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  code: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
    textAlign: 'center',
  },
  button: {
    marginTop: 16,
    minHeight: 48,
    minWidth: 220,
    paddingHorizontal: 24,
    borderWidth: 1.5,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default LockScreen;
