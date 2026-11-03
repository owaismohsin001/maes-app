import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getMainMenuData, listOperationTypes } from '../../api/barcode';
import type { OperationCode, OperationType } from '../../api/barcode';
import { useOdooQuery } from '../../hooks/useOdooQuery';
import { t } from '../../i18n';
import { useBarcode } from '../../navigation/barcodeContext';
import type { MenuTab } from '../../navigation/barcodeContext';
import { Header, Segmented, Tile, TileGrid } from '../../ui/primitives';
import { ScanWindow } from '../../ui/scanFeedback';
import { useUi } from '../../ui/theme';
import { OPERATION_LOOK } from './look';
import { ScanLayout, useMainScan } from './shared';

const OPERATION_CODES: OperationCode[] = ['incoming', 'outgoing', 'internal'];

type MenuInfo = { toCount: number; types: OperationType[] };

/**
 * The Barcode app's home. Two tabs: the scanner (opens first on the handheld:
 * the scan engine's live picture) and the menu of tasks, with the work waiting
 * counted on its tab. Scans are handled on both; codes are typed with the
 * header's keyboard button.
 */
function MenuScreen() {
  const { c, s, r, type } = useUi();
  const { nav, scanner, menuTab, setMenuTab } = useBarcode();
  const menu = useOdooQuery<MenuInfo>(async () => {
    const [main, types] = await Promise.all([
      getMainMenuData(),
      listOperationTypes(),
    ]);
    return { toCount: main.toCount, types };
  });
  const scan = useMainScan();
  const types = menu.data?.types ?? [];
  // Until the user picks one: a phone without the scanner opens on the menu.
  const tab: MenuTab =
    menuTab ?? (scanner.state === 'unavailable' ? 'menu' : 'scanner');

  const readyOf = (code: OperationCode) =>
    types.filter(op => op.code === code).reduce((n, op) => n + op.ready, 0);
  const lateOf = (code: OperationCode) =>
    types.some(op => op.code === code && op.late);
  const waiting =
    OPERATION_CODES.reduce((n, code) => n + readyOf(code), 0) +
    (menu.data?.toCount ?? 0);

  // Always the overview (total, late, up next), also for a kind with only one
  // operation type: the same screen for receipts and deliveries.
  const openOperations = (code: OperationCode) =>
    nav.push({ name: 'operations', code });

  return (
    <ScanLayout
      testID="barcode-menu"
      header={
        <Header
          title={t('barcode.title')}
          titleIcon="scan"
          center
          onBack={nav.pop}
          actions={[
            {
              icon: 'settings',
              label: t('scanner.settings'),
              onPress: nav.openStatus,
              testID: 'menu-status',
            },
          ]}
        >
          <Segmented<MenuTab>
            value={tab}
            onChange={setMenuTab}
            options={[
              { value: 'scanner', label: t('barcode.tab.scanner') },
              {
                value: 'menu',
                label: t('barcode.tab.menu'),
                count: waiting,
                countTone: OPERATION_CODES.some(lateOf) ? 'danger' : 'accent',
              },
            ]}
          />
        </Header>
      }
      onCode={scan.handle}
      message={scan.message}
      showsScanner={tab === 'scanner'}
      contentKey={tab}
      overlay={scan.sheets}
    >
      {tab === 'scanner' ? (
        <ScanWindow
          style={{ margin: s.lg, borderRadius: r.lg }}
          state={scanner.state}
          busy={scan.busy}
          problemText={scanner.problemText}
          onRetry={scanner.restart}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: s.lg, paddingBottom: s.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={menu.loading && !!menu.data}
              onRefresh={menu.reload}
              colors={[c.accent]}
            />
          }
        >
          <View style={[styles.hintRow, { marginBottom: s.md }]}>
            <Text style={[type.body, styles.fill, { color: c.textMuted }]}>
              {t('barcode.menu.scanHint')}
            </Text>
            {scan.busy ? (
              <ActivityIndicator
                color={c.accent}
                style={{ marginLeft: s.sm }}
              />
            ) : null}
          </View>

          <TileGrid>
            {OPERATION_CODES.map(code => (
              <Tile
                key={code}
                testID={`menu-op-${code}`}
                icon={OPERATION_LOOK[code].icon}
                label={t(`barcode.op.${code}`)}
                count={readyOf(code)}
                countTone={lateOf(code) ? 'danger' : 'accent'}
                onPress={() => openOperations(code)}
              />
            ))}
            <Tile
              testID="menu-count"
              icon="count"
              label={t('barcode.menu.count')}
              count={menu.data?.toCount}
              onPress={() => nav.push({ name: 'count' })}
            />
            <Tile
              testID="menu-search"
              icon="findProduct"
              label={t('barcode.menu.search')}
              onPress={() => nav.push({ name: 'search' })}
            />
          </TileGrid>
        </ScrollView>
      )}
    </ScanLayout>
  );
}

const styles = StyleSheet.create({
  hintRow: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
});

export default MenuScreen;
