import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { APP_VERSION, BRAND } from '../config';
import { TranslationKey, t } from '../i18n';
import {
  CameraPermission,
  ScannerStatus,
  SCANNER_STATE_LABELS,
  ScannerState,
  hasCameraPermission,
  requestCameraPermission,
  scannerState,
} from '../scanner/scanner';
import type { Scanner } from '../scanner/useScanner';
import Icon, { IconName } from '../ui/Icon';
import { FadeIn } from '../ui/motion';
import {
  Badge,
  Button,
  Card,
  DetailCard,
  DetailRow,
  Header,
  IconRowSeparator,
  ListRow,
  Screen,
} from '../ui/primitives';
import { Tone, Ui, toneColors, useUi } from '../ui/theme';

type Props = {
  scanner: Scanner;
  onClose: () => void;
};

const NONE = '—';

/** How each scanner state looks: icon, colour and what it means for the user. */
const LOOK: Record<
  ScannerState | 'checking',
  { icon: IconName; tone: Tone; body: TranslationKey }
> = {
  checking: {
    icon: 'scan',
    tone: 'neutral',
    body: 'scanner.state.checkingBody',
  },
  ready: { icon: 'success', tone: 'success', body: 'scanner.state.readyBody' },
  idle: { icon: 'activity', tone: 'warning', body: 'scanner.state.idleBody' },
  error: { icon: 'error', tone: 'danger', body: 'scanner.state.errorBody' },
  unavailable: {
    icon: 'scan',
    tone: 'neutral',
    body: 'scanner.state.unavailableBody',
  },
};

/**
 * Everything needed to tell from a screenshot why scanning does or doesn't
 * work on a device, plus a test scan and setting the hardware scan button.
 * Codes read while it is open stay here (the caller doesn't send them on).
 */
function ScannerStatusScreen({ scanner, onClose }: Props) {
  const ui = useUi();
  const { s } = ui;
  const {
    status,
    scanning,
    starting,
    lastCode,
    scan,
    stop,
    retry,
    learnScanKey,
    cancelLearnScanKey,
  } = scanner;

  const [learning, setLearning] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    // Set again on every run: Fast Refresh / StrictMode run the cleanup first.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Leaving the screen ends a pending "press the scan button".
  useEffect(() => () => cancelLearnScanKey(), [cancelLearnScanKey]);

  const learn = async () => {
    setLearning(true);
    await learnScanKey();
    if (mountedRef.current) {
      setLearning(false);
    }
  };

  const state = status ? scannerState(status) : null;

  return (
    <Screen>
      <Header
        title={t('scanner.settings')}
        titleIcon="scan"
        center
        onBack={onClose}
      />
      <ScrollView
        contentContainerStyle={{ padding: s.lg, paddingBottom: s.xxl }}
      >
        <FadeIn>
          <StatusCard state={state} onRetry={retry} />

          <SectionCard title={t('scanner.section.test')}>
            <LastScan code={lastCode} />
            <Text style={hintStyle(ui)}>{t('scanner.testHint')}</Text>
            <Button
              testID="scanner-test"
              label={t(scanning ? 'scanner.stop' : 'scanner.testScan')}
              icon={scanning ? 'close' : 'scan'}
              variant={scanning ? 'secondary' : 'primary'}
              loading={starting}
              disabled={state === 'unavailable'}
              onPress={scanning ? stop : scan}
            />
          </SectionCard>

          <SectionCard title={t('scanner.section.setup')} flush>
            <CameraRow
              status={status}
              canAsk={state !== null && state !== 'unavailable'}
              onGranted={retry}
            />
            <IconRowSeparator />
            <ListRow
              testID="scanner-scan-key"
              title={t('scanner.scanKey')}
              subtitle={
                learning
                  ? t('scanner.pressScanKey')
                  : t('scanner.keyCode').replace(
                      '%s',
                      status ? String(status.scanKeyCode) : NONE,
                    )
              }
              icon="keyboard"
              iconTone="accent"
              selected={learning}
              trailing={
                <Button
                  label={t(
                    learning ? 'common.cancel' : 'scanner.changeScanKey',
                  )}
                  variant="ghost"
                  size="md"
                  onPress={learning ? cancelLearnScanKey : learn}
                />
              }
            />
          </SectionCard>

          <DetailCard title={t('scanner.section.device')}>
            <DetailRow
              testID="scanner-app-version"
              icon="tag"
              label={t('scanner.appVersion')}
              value={APP_VERSION}
              mono
              half
            />
            <DetailRow
              icon="cpu"
              label={t('scanner.firmware')}
              value={status?.scannerVersion || NONE}
              mono
              half
              wrap
            />
            <DetailRow
              icon="layers"
              label={t('scanner.sdk')}
              value={status?.sdkVersion || NONE}
              mono
              half
              wrap
            />
            <DetailRow
              icon="barcode"
              label={t('scanner.decoder')}
              value={status?.decodeVersion || NONE}
              mono
              half
              wrap
            />
            <DetailRow
              icon="camera"
              label={t('scanner.cameras')}
              value={status ? String(status.cameraCount) : NONE}
              mono
              half
            />
            <DetailRow
              icon="settings"
              label={t('scanner.helper')}
              value={
                status
                  ? t(
                      status.helperInstalled
                        ? 'scanner.installed'
                        : 'scanner.notInstalled',
                    )
                  : NONE
              }
              tone={status && !status.helperInstalled ? 'warning' : undefined}
            />
            {status?.error ? (
              <DetailRow
                testID="scanner-error"
                icon="error"
                label={t('scanner.errorDetails')}
                value={status.error}
                tone="danger"
                wrap
              />
            ) : null}
          </DetailCard>
        </FadeIn>
      </ScrollView>
    </Screen>
  );
}

const openSettings = () => Linking.openSettings().catch(() => {});

/**
 * The camera permission the scan engine needs. Android lets an app only ask
 * for it (the system dialog) or send the user to its Settings page, never
 * switch it itself: so an Allow / Open settings action, not a toggle.
 */
function CameraRow({
  status,
  canAsk,
  onGranted,
}: {
  status: ScannerStatus | null;
  /** False on phones without the scanner: no camera prompt there. */
  canAsk: boolean;
  /** Powers the scanner up once the permission is there. */
  onGranted: () => void;
}) {
  const [camera, setCamera] = useState<CameraPermission | null>(null);
  const mountedRef = useRef(true);

  // Again after every retry or scan (which update the status) and on coming
  // back from Android's Settings. "Blocked" is only known from a request.
  useEffect(() => {
    mountedRef.current = true;
    const check = () =>
      hasCameraPermission()
        .then(
          granted =>
            mountedRef.current &&
            setCamera(prev =>
              granted ? 'granted' : prev === 'blocked' ? 'blocked' : 'denied',
            ),
        )
        .catch(() => {});
    check();
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        check();
      }
    });
    return () => {
      mountedRef.current = false;
      sub.remove();
    };
  }, [status]);

  const allow = async () => {
    const result = await requestCameraPermission();
    if (!mountedRef.current) {
      return;
    }
    setCamera(result);
    if (result === 'granted') {
      onGranted();
    }
  };

  const granted = camera === 'granted';
  const action =
    camera === null || granted || !canAsk ? null : camera === 'blocked' ? (
      <Button
        testID="scanner-camera-settings"
        label={t('scanner.openSettings')}
        variant="secondary"
        size="md"
        onPress={openSettings}
      />
    ) : (
      <Button
        testID="scanner-camera-allow"
        label={t('scanner.allowCamera')}
        variant="secondary"
        size="md"
        onPress={allow}
      />
    );
  const needsAction = action !== null;

  return (
    <ListRow
      testID="scanner-camera"
      title={t('scanner.camera')}
      subtitle={t(
        !needsAction
          ? 'scanner.cameraBody'
          : camera === 'blocked'
          ? 'scanner.cameraBlockedRow'
          : 'scanner.cameraDenied',
      )}
      icon="camera"
      iconTone={needsAction ? 'danger' : 'accent'}
      onPress={granted ? openSettings : undefined}
      chevron={granted}
      trailing={
        action ??
        (camera === null ? (
          <Badge label={t('scanner.state.checking')} />
        ) : (
          <Badge
            label={t(granted ? 'scanner.allowed' : 'scanner.notAllowed')}
            tone={granted ? 'success' : 'danger'}
          />
        ))
      }
    />
  );
}

/** The scanner's state at a glance: icon, state, what it means, and a retry. */
function StatusCard({
  state,
  onRetry,
}: {
  state: ScannerState | null;
  onRetry: () => void;
}) {
  const { c, s, r, type } = useUi();
  const look = LOOK[state ?? 'checking'];
  const { fg, bg } = toneColors(c, look.tone);
  // Also while still checking: a scan engine that never answers must not leave the user stuck.
  const broken = state !== 'ready';
  return (
    <Card style={{ padding: s.lg }}>
      <View testID="scanner-state" style={styles.statusRow} accessible>
        <View
          style={[
            styles.statusIcon,
            { backgroundColor: bg, borderRadius: r.md, marginRight: s.lg },
          ]}
        >
          {state ? (
            <Icon name={look.icon} color={fg} size={28} />
          ) : (
            <ActivityIndicator color={c.textMuted} />
          )}
        </View>
        <View style={styles.fill}>
          <Text
            style={[type.title, { color: c.text }]}
            accessibilityRole="header"
          >
            {t(state ? SCANNER_STATE_LABELS[state] : 'scanner.state.checking')}
          </Text>
          <Text style={[type.body, { color: c.textMuted, marginTop: s.xs }]}>
            {t(look.body).replace('%s', BRAND.appName)}
          </Text>
        </View>
      </View>
      {broken ? (
        <Button
          testID="scanner-retry"
          label={t('common.retry')}
          icon="refresh"
          variant="secondary"
          size="md"
          onPress={onRetry}
          style={{ marginTop: s.lg }}
        />
      ) : null}
    </Card>
  );
}

/** A titled card; `flush` lets full-width rows run to its edges. */
function SectionCard({
  title,
  flush = false,
  children,
}: {
  title: string;
  flush?: boolean;
  children: React.ReactNode;
}) {
  const { c, s, type } = useUi();
  return (
    <Card style={[{ marginTop: s.md }, !flush && { padding: s.lg }]}>
      <Text
        style={[
          type.heading,
          { color: c.text },
          flush
            ? { paddingHorizontal: s.lg, paddingTop: s.lg, paddingBottom: s.xs }
            : { marginBottom: s.md },
        ]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {children}
    </Card>
  );
}

/** The code the test scan read, large enough to compare with the label. */
function LastScan({ code }: { code: string | null }) {
  const { c, s, r, type } = useUi();
  return (
    <View
      style={[
        styles.lastScan,
        {
          backgroundColor: code ? c.accentSoft : c.surfaceAlt,
          borderRadius: r.md,
          padding: s.md,
        },
      ]}
    >
      <View style={{ marginRight: s.md }}>
        <Icon name="barcode" color={code ? c.accent : c.textFaint} size={24} />
      </View>
      <View style={styles.fill}>
        <Text style={[type.caption, { color: c.textMuted }]}>
          {t('scanner.lastScan')}
        </Text>
        {code ? (
          <FadeIn key={code} rise={6}>
            <Text
              testID="scanner-last-code"
              style={[
                type.mono,
                {
                  fontSize: type.title.fontSize,
                  lineHeight: type.title.lineHeight,
                  color: c.text,
                },
                styles.line,
              ]}
              selectable
            >
              {code}
            </Text>
          </FadeIn>
        ) : (
          <Text
            testID="scanner-last-code"
            style={[type.body, styles.line, { color: c.textFaint }]}
          >
            {t('scanner.noScanYet')}
          </Text>
        )}
      </View>
    </View>
  );
}

const hintStyle = ({ c, s, type }: Ui) => ({
  ...type.caption,
  color: c.textMuted,
  marginTop: s.sm,
  marginBottom: s.lg,
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  line: { marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastScan: { flexDirection: 'row', alignItems: 'center' },
});

export default ScannerStatusScreen;
