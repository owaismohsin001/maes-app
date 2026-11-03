import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { listNextPickings, listOperationTypes } from '../../api/barcode';
import type {
  OperationCode,
  OperationType,
  PickingSummary,
} from '../../api/barcode';
import { useLiveSync } from '../../hooks/useLiveSync';
import { useOdooQuery } from '../../hooks/useOdooQuery';
import { t } from '../../i18n';
import {
  errorText,
  isOffline,
  useBarcode,
} from '../../navigation/barcodeContext';
import Icon from '../../ui/Icon';
import {
  Badge,
  CardSegment,
  Header,
  ListRow,
  OverviewCard,
  SectionLabel,
  IconRowSeparator,
} from '../../ui/primitives';
import { Collapsible, EASE_IN_OUT } from '../../ui/motion';
import StateView from '../../ui/StateView';
import { useUi } from '../../ui/theme';
import { formatDue } from '../../utils/format';
import { OPERATION_LOOK } from './look';
import { ScanLayout, useMainScan } from './shared';

type Section = { key: 'places'; title: string; data: OperationType[] };

type Props = { code: OperationCode };

type Overview = { types: OperationType[]; next: PickingSummary[] };

/** Rows under "Up next"; one more is loaded to know there are more. */
const NEXT_SHOWN = 5;

const hasWork = (op: OperationType) => op.ready + op.late + op.waiting > 0;

/**
 * One kind of operation (receipts, deliveries, internal transfers) across the
 * main warehouse and the technicians' vans: the total and what is late, the
 * transfers to do first wherever they are, then the places with work, then
 * (folded) the places with nothing open. Kept in step with Odoo while open.
 */
function OperationsScreen({ code }: Props) {
  const { c, s, type } = useUi();
  const { nav, session } = useBarcode();
  const uid = session?.uid ?? 0;
  const load = async (): Promise<Overview> => {
    const [types, next] = await Promise.all([
      listOperationTypes(),
      listNextPickings(code, uid, NEXT_SHOWN + 1),
    ]);
    return { types, next };
  };
  const overview = useOdooQuery(load, `${code}:${uid}`);
  const scan = useMainScan();
  const [idleOpen, setIdleOpen] = useState<boolean | null>(null);
  const chevronTurn = useRef(new Animated.Value(0)).current;

  // A delivery validated or reserved elsewhere shows up here by itself. The
  // check is the overview's own small read; only a difference is shown.
  const latest = useRef<Overview | null>(null);
  const { rebase } = useLiveSync({
    enabled: !!overview.data,
    intervalMs: 30000,
    idleIntervalMs: 60000,
    stamp: async () => {
      latest.current = await load();
      return JSON.stringify(latest.current);
    },
    onChange: async () => {
      if (latest.current) {
        overview.setData(latest.current);
      }
      return true;
    },
  });
  useEffect(() => {
    if (overview.data) {
      rebase(JSON.stringify(overview.data));
    }
  }, [overview.data, rebase]);

  const view = useMemo(() => {
    const all = overview.data?.types ?? [];
    // Warehouses that receive goods are real warehouses; the others are vans.
    const receiving = new Set(
      all.filter(op => op.code === 'incoming').map(op => op.warehouse),
    );
    const ofCode = all.filter(op => op.code === code);
    const perWarehouse = new Map<string | null, number>();
    for (const op of ofCode) {
      perWarehouse.set(op.warehouse, (perWarehouse.get(op.warehouse) ?? 0) + 1);
    }
    // Same kind twice in one warehouse: tell them apart by name.
    const shared = (op: OperationType) =>
      (perWarehouse.get(op.warehouse) ?? 0) > 1;
    const byId = new Map(ofCode.map(op => [op.id, op]));
    const todo = ofCode
      .filter(hasWork)
      .sort((a, b) => b.late - a.late || b.ready - a.ready);
    const idle = ofCode
      .filter(op => !hasWork(op))
      .sort((a, b) => (a.warehouse ?? '').localeCompare(b.warehouse ?? ''));
    const total = (key: 'ready' | 'late' | 'waiting') =>
      ofCode.reduce((n, op) => n + op[key], 0);
    const next = overview.data?.next ?? [];
    return {
      ofCode,
      todo,
      idle,
      next: next.slice(0, NEXT_SHOWN),
      moreNext: next.length > NEXT_SHOWN,
      isVan: (op: OperationType) => !receiving.has(op.warehouse),
      shared,
      placeOf: (typeId: number | null) => {
        const op = typeId === null ? undefined : byId.get(typeId);
        if (!op) {
          return null;
        }
        return op.warehouse
          ? shared(op)
            ? `${op.warehouse}: ${op.name}`
            : op.warehouse
          : op.name;
      },
      totals: {
        ready: total('ready'),
        late: total('late'),
        waiting: total('waiting'),
      },
    };
  }, [overview.data, code]);

  // Nothing to do anywhere: show the idle list straight away.
  const showIdle = idleOpen ?? view.todo.length === 0;
  const sections: Section[] = view.todo.length
    ? [
        {
          key: 'places',
          title: t('barcode.operations.byPlace'),
          data: view.todo,
        },
      ]
    : [];

  // The chevron turns from the old direction (1) to the new icon at rest (0),
  // before the new icon paints; only on a tap, not when the data arrives.
  const turnedRef = useRef(showIdle);
  useLayoutEffect(() => {
    const changed = turnedRef.current !== showIdle;
    turnedRef.current = showIdle;
    if (!changed || idleOpen === null) {
      return;
    }
    chevronTurn.setValue(1);
    Animated.timing(chevronTurn, {
      toValue: 0,
      duration: 320,
      easing: EASE_IN_OUT,
      useNativeDriver: true,
    }).start();
  }, [showIdle, idleOpen, chevronTurn]);

  const open = (op: OperationType) =>
    nav.push({
      name: 'pickings',
      typeId: op.id,
      typeName: op.warehouse ? `${op.warehouse}: ${op.name}` : op.name,
      code: op.code,
    });

  const renderOperation = (
    item: OperationType,
    index: number,
    count: number,
  ) => {
    const first = index === 0;
    const last = index === count - 1;
    const van = view.isVan(item);
    return (
      <CardSegment
        key={item.id}
        edge={
          first && last ? 'both' : first ? 'top' : last ? 'bottom' : undefined
        }
      >
        {first ? null : <IconRowSeparator />}
        <ListRow
          testID={`operation-${item.id}`}
          title={item.warehouse ?? item.name}
          subtitle={
            [
              view.shared(item) ? item.name : null,
              item.waiting
                ? t('barcode.operations.waiting').replace(
                    '%s',
                    String(item.waiting),
                  )
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
          icon={van ? 'truck' : 'warehouse'}
          iconTone={van ? 'neutral' : 'accent'}
          trailing={
            item.ready || item.late ? (
              <View style={styles.badges}>
                {item.ready ? (
                  <Badge
                    label={t('barcode.operations.ready').replace(
                      '%s',
                      String(item.ready),
                    )}
                    tone="success"
                  />
                ) : null}
                {item.late ? (
                  <Badge
                    label={t('barcode.operations.late').replace(
                      '%s',
                      String(item.late),
                    )}
                    tone="danger"
                  />
                ) : null}
              </View>
            ) : undefined
          }
          chevron
          onPress={() => open(item)}
        />
      </CardSegment>
    );
  };

  const look = OPERATION_LOOK[code] ?? OPERATION_LOOK.internal;
  const { ready, late, waiting } = view.totals;
  const head = (
    <View>
      <View style={{ paddingHorizontal: s.lg, paddingTop: s.lg }}>
        <OverviewCard
          testID="operations-overview"
          icon={look.icon}
          label={t(`barcode.overview.${code}`)}
          total={ready + waiting}
          shares={[
            { label: t('barcode.stat.ready'), value: ready, tone: 'success' },
            {
              label: t('barcode.stat.waiting'),
              value: waiting,
              tone: 'warning',
            },
          ]}
          status={
            late
              ? {
                  tone: 'danger',
                  icon: 'warning',
                  title: t('barcode.overview.late').replace('%s', String(late)),
                  body: t('barcode.overview.lateHint'),
                }
              : {
                  tone: 'success',
                  icon: 'success',
                  title:
                    ready + waiting
                      ? t('barcode.overview.onSchedule')
                      : t('barcode.overview.nothing'),
                }
          }
        />
      </View>
      {view.next.length ? (
        <View testID="operations-next">
          <SectionLabel label={t('barcode.operations.upNext')} />
          {view.next.map((item, i) => (
            <CardSegment
              key={item.id}
              edge={
                view.next.length === 1
                  ? 'both'
                  : i === 0
                  ? 'top'
                  : i === view.next.length - 1
                  ? 'bottom'
                  : undefined
              }
            >
              {i === 0 ? null : <IconRowSeparator />}
              <NextRow
                item={item}
                code={code}
                place={view.placeOf(item.typeId)}
                onPress={() => nav.push({ name: 'picking', id: item.id })}
              />
            </CardSegment>
          ))}
          {view.moreNext ? (
            <Text
              style={[
                type.caption,
                {
                  color: c.textMuted,
                  paddingHorizontal: s.lg,
                  paddingTop: s.sm,
                },
              ]}
            >
              {t('barcode.operations.upNextMore')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  // The places with nothing open: a fold under the list. Its rows are always
  // rendered, so opening it is only an animation.
  const idleFold = view.idle.length ? (
    <View>
      <Pressable
        testID="operations-idle-toggle"
        onPress={() => setIdleOpen(!showIdle)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showIdle }}
        style={[
          styles.idleToggle,
          { paddingHorizontal: s.lg, paddingTop: s.xl, paddingBottom: s.sm },
        ]}
      >
        <Text style={[type.label, styles.fill, { color: c.textMuted }]}>
          {`${t('barcode.operations.idle')} (${view.idle.length})`}
        </Text>
        <Text style={[type.label, { color: c.accent }]}>
          {showIdle
            ? t('barcode.operations.hideIdle')
            : t('barcode.operations.showIdle')}
        </Text>
        <Animated.View
          style={{
            transform: [
              {
                rotate: chevronTurn.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', showIdle ? '-180deg' : '180deg'],
                }),
              },
            ],
          }}
        >
          <Icon
            name={showIdle ? 'chevronUp' : 'chevronDown'}
            color={c.accent}
            size={18}
          />
        </Animated.View>
      </Pressable>
      <Collapsible open={showIdle} testID="operations-idle">
        {view.idle.map((op, i) => renderOperation(op, i, view.idle.length))}
      </Collapsible>
    </View>
  ) : undefined;

  let body;
  if (!overview.data) {
    body = overview.error ? (
      <StateView
        kind={isOffline(overview.error) ? 'offline' : 'error'}
        title={t('barcode.error.title')}
        body={errorText(overview.error)}
        actionLabel={t('common.retry')}
        onAction={overview.reload}
      />
    ) : (
      <StateView kind="loading" />
    );
  } else if (!view.ofCode.length) {
    body = <StateView kind="empty" title={t('barcode.operations.empty')} />;
  } else {
    body = (
      <SectionList
        testID="operations-list"
        sections={sections}
        keyExtractor={op => String(op.id)}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={overview.loading}
            onRefresh={overview.reload}
            colors={[c.accent]}
          />
        }
        contentContainerStyle={{ paddingBottom: s.xxl }}
        ListHeaderComponent={head}
        renderSectionHeader={({ section }) => (
          <SectionLabel label={section.title} />
        )}
        renderItem={({ item, index, section }) =>
          renderOperation(item, index, section.data.length)
        }
        ListFooterComponent={idleFold}
      />
    );
  }

  return (
    <ScanLayout
      testID="barcode-operations"
      contentKey={overview.data ? 'data' : overview.error ? 'error' : 'loading'}
      header={
        <Header
          title={t(`barcode.op.${code}`)}
          subtitle={
            !overview.data
              ? undefined
              : view.ofCode.length === 1
              ? t('barcode.operations.onePlace')
              : t('barcode.operations.places').replace(
                  '%s',
                  String(view.ofCode.length),
                )
          }
          onBack={nav.pop}
        />
      }
      onCode={scan.handle}
      message={scan.message}
      overlay={scan.sheets}
    >
      {body}
    </ScanLayout>
  );
}

/** A transfer to do first: where it is, for whom, and when it is due. */
function NextRow({
  item,
  code,
  place,
  onPress,
}: {
  item: PickingSummary;
  code: OperationCode;
  place: string | null;
  onPress: () => void;
}) {
  const look = OPERATION_LOOK[code] ?? OPERATION_LOOK.internal;
  const due = formatDue(item.scheduled);
  return (
    <ListRow
      testID={`next-${item.id}`}
      title={item.name}
      subtitle={item.partner ?? item.origin ?? undefined}
      meta={[place, item.partner ? item.origin : null]
        .filter(Boolean)
        .join(' · ')}
      icon={look.icon}
      iconTone={due.late || item.priority ? 'danger' : look.tone}
      trailing={
        due.text ? (
          <Badge label={due.text} tone={due.late ? 'danger' : 'neutral'} />
        ) : undefined
      }
      chevron
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  badges: { alignItems: 'flex-end', gap: 4 },
  fill: { flex: 1 },
  idleToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

export default OperationsScreen;
