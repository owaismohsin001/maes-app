import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { listPickings } from '../../api/barcode';
import type {
  OperationCode,
  PickingFilter,
  PickingSummary,
} from '../../api/barcode';
import LogoSpinner from '../../components/LogoSpinner';
import { useOdooQuery } from '../../hooks/useOdooQuery';
import { t } from '../../i18n';
import {
  errorText,
  isOffline,
  useBarcode,
} from '../../navigation/barcodeContext';
import {
  Badge,
  Header,
  ListRow,
  Segmented,
  IconRowSeparator,
} from '../../ui/primitives';
import { FadeIn } from '../../ui/motion';
import StateView from '../../ui/StateView';
import { useUi } from '../../ui/theme';
import { formatDateTime, isPast } from '../../utils/format';
import { OPERATION_LOOK, STATE_LOOK } from './look';
import { ScanLayout, useMainScan } from './shared';

type Props = { typeId: number; typeName: string; code: OperationCode };

/** The transfers of one operation type. */
function PickingListScreen({ typeId, typeName, code }: Props) {
  const { c, s } = useUi();
  const { nav, session } = useBarcode();
  const [filter, setFilter] = useState<PickingFilter>('ready');
  const uid = session?.uid ?? 0;
  // The rows say which tab they were loaded for: the old tab's rows stay
  // (dimmed) until the new ones arrive and slide in.
  const list = useOdooQuery(
    async () => ({ filter, rows: await listPickings(typeId, filter, uid) }),
    `${typeId}:${filter}`,
  );
  const shownFilter = list.data?.filter;
  // Only a tab switch slides sideways; the first rows just fade in.
  const switchedRef = useRef(false);
  const chooseFilter = (f: PickingFilter) => {
    switchedRef.current = true;
    setFilter(f);
  };
  const stale = shownFilter !== undefined && shownFilter !== filter;
  const dim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.timing(dim, {
      toValue: stale ? 0.35 : 1,
      duration: stale ? 150 : 0,
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [stale, dim]);
  const scan = useMainScan();

  let body;
  // The other tab's rows didn't load: say so instead of spinning on.
  const switchFailed = stale && !list.loading && list.error != null;
  if (!list.data || switchFailed) {
    body = list.error ? (
      <StateView
        kind={isOffline(list.error) ? 'offline' : 'error'}
        title={t('barcode.error.title')}
        body={errorText(list.error)}
        actionLabel={t('common.retry')}
        onAction={list.reload}
      />
    ) : (
      <StateView kind="loading" />
    );
  } else {
    body = (
      <View style={styles.fill}>
        <Animated.View style={[styles.fill, { opacity: dim }]}>
          <FadeIn
            key={shownFilter}
            style={styles.fill}
            rise={0}
            // From the side of the tab it belongs to.
            shift={
              switchedRef.current ? (shownFilter === 'ready' ? -40 : 40) : 0
            }
          >
            <FlatList
              testID="picking-list"
              data={list.data.rows}
              keyExtractor={p => String(p.id)}
              refreshControl={
                <RefreshControl
                  refreshing={list.loading && !stale}
                  onRefresh={list.reload}
                  colors={[c.accent]}
                />
              }
              contentContainerStyle={[styles.grow, { paddingBottom: s.xxl }]}
              ItemSeparatorComponent={IconRowSeparator}
              ListEmptyComponent={
                <StateView
                  kind="empty"
                  title={t('barcode.pickings.empty')}
                  body={
                    filter === 'ready'
                      ? t('barcode.pickings.emptyReady')
                      : undefined
                  }
                  actionLabel={
                    filter === 'ready'
                      ? t('barcode.pickings.showOpen')
                      : undefined
                  }
                  onAction={() => chooseFilter('open')}
                />
              }
              renderItem={({ item }) => (
                <PickingRow
                  item={item}
                  code={code}
                  onPress={() => nav.push({ name: 'picking', id: item.id })}
                />
              )}
            />
          </FadeIn>
        </Animated.View>
        {stale ? (
          <FadeIn
            style={styles.switching}
            rise={0}
            delay={80}
            testID="picking-list-switching"
          >
            <LogoSpinner size={48} />
          </FadeIn>
        ) : null}
      </View>
    );
  }

  return (
    <ScanLayout
      testID="barcode-pickings"
      contentKey={
        list.data && !switchFailed ? 'data' : list.error ? 'error' : 'loading'
      }
      header={
        <Header title={typeName} onBack={nav.pop}>
          <Segmented<PickingFilter>
            value={filter}
            onChange={chooseFilter}
            options={[
              { value: 'ready', label: t('barcode.pickings.ready') },
              { value: 'open', label: t('barcode.pickings.open') },
            ]}
          />
        </Header>
      }
      onCode={scan.handle}
      message={scan.message}
      overlay={scan.sheets}
    >
      {body}
    </ScanLayout>
  );
}

function PickingRow({
  item,
  code,
  onPress,
}: {
  item: PickingSummary;
  code: OperationCode;
  onPress: () => void;
}) {
  const look = OPERATION_LOOK[code] ?? OPERATION_LOOK.internal;
  const state = STATE_LOOK[item.state] ?? STATE_LOOK.draft;
  const late = item.state !== 'done' && isPast(item.scheduled);
  const route = [item.from, item.to].filter(Boolean).join(' → ');
  return (
    <ListRow
      testID={`picking-${item.id}`}
      title={item.name}
      subtitle={item.partner ?? item.origin ?? route}
      meta={[formatDateTime(item.scheduled), item.partner ? item.origin : null]
        .filter(Boolean)
        .join(' · ')}
      icon={look.icon}
      iconTone={item.priority ? 'danger' : look.tone}
      trailing={
        <Badge
          label={late ? t('barcode.state.late') : t(state.label)}
          tone={late ? 'danger' : state.tone}
        />
      }
      chevron
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  grow: { flexGrow: 1 },
  fill: { flex: 1 },
  // Over the dimmed rows, a little above the middle (thumb and toast below).
  switching: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
});

export default PickingListScreen;
