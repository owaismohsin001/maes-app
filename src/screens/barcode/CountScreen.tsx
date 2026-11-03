import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import {
  applyCount,
  findProductsByReference,
  getCountData,
  getQuants,
  lookupBarcode,
  saveCountLines,
} from '../../api/barcode';
import type { CountData, Location, Product } from '../../api/barcode';
import { useOdooQuery } from '../../hooks/useOdooQuery';
import { t } from '../../i18n';
import {
  errorText,
  isOffline,
  isSessionError,
  useBackHandler,
  useBarcode,
  useScanMessages,
} from '../../navigation/barcodeContext';
import {
  CountEvent,
  CountLine,
  CountView,
  applyCountEvents,
  countAliasesAfterSave,
  countCommands,
  countedLines,
  linesForLocation,
  mergeCountData,
} from '../../barcode/count';
import {
  barcodeCommand,
  locationByBarcode,
  productByBarcode,
} from '../../barcode/picking';
import { useSyncedEdits } from '../../barcode/useSyncedEdits';
import Icon from '../../ui/Icon';
import {
  Badge,
  Button,
  CardSegment,
  Header,
  IconRowSeparator,
  ListRow,
  OverviewCard,
  SectionLabel,
  Stepper,
  formatQty,
} from '../../ui/primitives';
import type { OverviewCardProps } from '../../ui/primitives';
import Sheet from '../../ui/Sheet';
import StateView from '../../ui/StateView';
import { useUi } from '../../ui/theme';
import { ProductPickerSheet, ScanLayout, productCodes } from './shared';

/** Physical inventory screen: Odoo Barcode's "Count Inventory". */
function CountScreen() {
  const { c, s, r, type } = useUi();
  const { nav } = useBarcode();
  const { message, show } = useScanMessages();
  const query = useOdooQuery(getCountData);

  const edits = useSyncedEdits<CountData, CountEvent, CountView>({
    apply: applyCountEvents,
    commands: countCommands,
    save: async (cmds, d) => mergeCountData(d, await saveCountLines(cmds)),
    aliasesAfterSave: countAliasesAfterSave,
    combine: mergeCountData,
    onRejected: e => {
      show('danger', errorText(e));
      query.reload();
    },
  });
  const { reset, getData, getView, flush, push, mergeData, resolveKey } = edits;
  useEffect(() => {
    if (query.data) {
      reset(query.data);
    }
  }, [query.data, reset]);
  const data = edits.data;
  const view = edits.view;

  // The location being counted: where most lines are, until one is scanned.
  // A ref too: scan handlers run between renders.
  const [locationId, setLocationIdState] = useState<number | null>(null);
  const locationIdRef = useRef<number | null>(null);
  const setLocationId = (id: number | null) => {
    locationIdRef.current = id;
    setLocationIdState(id);
  };
  useEffect(() => {
    if (locationIdRef.current !== null || !data) {
      return;
    }
    const counts = new Map<number, number>();
    for (const q of data.quants) {
      counts.set(q.locationId, (counts.get(q.locationId) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const first = Object.values(data.locations).find(
      l => l.usage === 'internal',
    );
    const id = best?.[0] ?? first?.id ?? null;
    locationIdRef.current = id;
    setLocationIdState(id);
  }, [data]);

  const location: Location | null =
    (locationId !== null && data?.locations[locationId]) || null;
  const lines = useMemo(
    () =>
      view && locationId !== null ? linesForLocation(view, locationId) : [],
    [view, locationId],
  );
  // How far this location is: counted (matching or not) and still to count.
  const progress = useMemo(() => {
    const showQty = data?.showQuantity ?? false;
    let matching = 0;
    let different = 0;
    for (const l of lines) {
      if (!l.inventoryQuantitySet) {
        continue;
      }
      if (showQty && l.inventoryQuantity !== l.quantity) {
        different++;
      } else {
        matching++;
      }
    }
    return { matching, different, todo: lines.length - matching - different };
  }, [lines, data?.showQuantity]);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const counted = view
    ? view.lines.filter(l => l.inventoryQuantitySet).length
    : 0;

  const [selected, setSelected] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [awaitingLot, setAwaitingLotState] = useState<Product | null>(null);
  const awaitingLotRef = useRef<Product | null>(null);
  const setAwaitingLot = (p: Product | null) => {
    awaitingLotRef.current = p;
    setAwaitingLotState(p);
  };
  const [editKey, setEditKey] = useState<string | null>(null);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [needsOdoo, setNeedsOdoo] = useState(false);
  const [choices, setChoices] = useState<Product[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [unsavedOnLeave, setUnsavedOnLeave] = useState(false);
  const applyingRef = useRef(false);
  const leavingRef = useRef(false);
  const newKeyCounter = useRef(0);
  const extraProducts = useRef<Record<number, Product>>({});
  const listRef = useRef<FlatList<CountLine>>(null);

  const productOf = (id: number) =>
    data?.products[id] ?? extraProducts.current[id];

  const highlight = (key: string) => {
    setSelected(key);
    setFlash(f => ({ ...f, [key]: (f[key] ?? 0) + 1 }));
    setTimeout(() => {
      const index = linesRef.current.findIndex(l => l.key === key);
      if (index >= 0) {
        listRef.current?.scrollToIndex({
          index,
          viewPosition: 0.4,
          animated: true,
        });
      }
    }, 50);
  };

  const addUnit = (
    p: Product,
    lot: { lotId?: number; lotName?: string } = {},
  ) => {
    const locId = locationIdRef.current;
    if (locId === null) {
      return;
    }
    const newKey = `v:${++newKeyCounter.current}`;
    push({
      type: 'add',
      productId: p.id,
      locationId: locId,
      qty: 1,
      lotId: lot.lotId ?? null,
      lotName: lot.lotName ?? null,
      newKey,
    });
    const target = getView()?.touched[newKey];
    if (target) {
      highlight(target);
    }
    show('success', `+1 ${p.name}${lot.lotName ? ` · ${lot.lotName}` : ''}`);
  };

  const handleProduct = async (p: Product) => {
    const d = getData();
    const v = getView();
    const locId = locationIdRef.current;
    if (!d || !v || locId === null) {
      return;
    }
    if (!p.isStorable) {
      show('warning', t('barcode.count.notStorable').replace('%s', p.name));
      return;
    }
    if (!d.products[p.id]) {
      extraProducts.current[p.id] = p;
    }
    if (p.tracking !== 'none' && d.groups.lots) {
      setAwaitingLot(p);
      show(
        'info',
        t(
          p.tracking === 'serial'
            ? 'barcode.picking.scanSerial'
            : 'barcode.picking.scanLot',
        ).replace('%s', p.name),
      );
      return;
    }
    setAwaitingLot(null);
    const known = v.lines.some(
      l => l.productId === p.id && l.locationId === locId,
    );
    if (!known) {
      // Like Odoo: count on the existing quant if there is one.
      const existing = await getQuants(p.id, locId);
      if (existing.quants.length) {
        mergeData(cur => mergeCountData(cur, existing));
      }
    }
    addUnit(p);
  };

  const handleLot = async (p: Product, code: string) => {
    const d = getData();
    if (!d || locationIdRef.current === null) {
      return;
    }
    let lot = Object.values(d.lots).find(
      l => l.name === code && l.productId === p.id,
    );
    if (!lot) {
      lot = (await lookupBarcode(code)).lots.find(l => l.productId === p.id);
    }
    if (lot) {
      addUnit(p, { lotId: lot.id });
    } else {
      addUnit(p, { lotName: code });
    }
  };

  const switchLocation = (loc: Location) => {
    mergeData(d => ({
      ...d,
      locations: { ...d.locations, [loc.id]: loc },
    }));
    setLocationId(loc.id);
    setAwaitingLot(null);
    show('info', t('barcode.count.location').replace('%s', loc.name));
  };

  // -------------------------------------------------------------------------
  // Apply / leave
  // -------------------------------------------------------------------------

  const openApply = async () => {
    try {
      await flush();
    } catch (e) {
      show('danger', errorText(e));
      return;
    }
    const v = getView();
    if (!v || !countedLines(v).length) {
      show('warning', t('barcode.count.nothing'));
      return;
    }
    setApplyOpen(true);
  };

  const apply = async () => {
    if (applyingRef.current) {
      return;
    }
    applyingRef.current = true;
    setApplyOpen(false);
    setApplying(true);
    try {
      // Scans made while the sheet was open are part of the count too.
      await flush();
      const v = getView();
      const ids = v ? countedLines(v).map(l => l.id) : [];
      if (!ids.length) {
        show('warning', t('barcode.count.nothing'));
        return;
      }
      const result = await applyCount(ids);
      if (result.kind === 'action') {
        setNeedsOdoo(true);
        return;
      }
      show('success', t('barcode.count.applied'));
      await query.reload();
    } catch (e) {
      if (isSessionError(e)) {
        nav.signIn();
        return;
      }
      show('danger', errorText(e));
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  const leave = async () => {
    if (leavingRef.current) {
      return;
    }
    leavingRef.current = true;
    try {
      await flush();
      nav.pop();
    } catch {
      leavingRef.current = false;
      setUnsavedOnLeave(true);
    }
  };

  const openInOdoo = async (path: string) => {
    try {
      await flush();
    } catch (e) {
      show('danger', errorText(e));
      return;
    }
    nav.openOdoo(path);
  };

  useBackHandler(() => {
    leave();
    return true;
  });

  // -------------------------------------------------------------------------
  // Scans
  // -------------------------------------------------------------------------

  const handleCode = async (code: string) => {
    const d = getData();
    if (!d || !code || applyingRef.current || leavingRef.current) {
      return;
    }
    const command = barcodeCommand(code);
    if (command === 'validate' || code.toUpperCase() === 'OBTAPPLY') {
      await openApply();
      return;
    }
    if (command === 'menu') {
      await leave();
      return;
    }
    if (command === 'unsupported') {
      show('info', t('barcode.scan.unsupportedCommand'));
      return;
    }
    let loc = locationByBarcode(d.locations, code);
    let product = loc
      ? null
      : productByBarcode({ ...extraProducts.current, ...d.products }, code);
    const lotFor = awaitingLotRef.current;
    if (!loc && !product && lotFor) {
      await handleLot(lotFor, code);
      return;
    }
    if (!loc && !product) {
      const found = await lookupBarcode(code);
      product = found.products[0] ?? null;
      loc = product
        ? null
        : found.locations.find(l => l.usage === 'internal') ?? null;
    }
    if (!loc && !product) {
      const byRef = await findProductsByReference(code);
      if (byRef.length > 1) {
        setChoices(byRef);
        return;
      }
      product = byRef[0] ?? null;
    }
    if (loc) {
      switchLocation(loc);
    } else if (product) {
      await handleProduct(product);
    } else {
      show('danger', t('barcode.scan.unknown').replace('%s', code));
    }
  };

  // One scan (or sheet choice) at a time, in order, by the latest handler.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const handlers = useRef({ handleCode, handleProduct });
  handlers.current = { handleCode, handleProduct };
  const enqueue = useCallback(
    (task: () => void | Promise<void>) => {
      queue.current = queue.current.then(task).catch(e => {
        if (isSessionError(e)) {
          nav.signIn();
        } else {
          show('danger', errorText(e));
        }
      });
    },
    [nav, show],
  );
  const onCode = useCallback(
    (code: string) => enqueue(() => handlers.current.handleCode(code)),
    [enqueue],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const header = (
    <Header
      title={t('barcode.menu.count')}
      subtitle={
        edits.saveError
          ? t('barcode.save.failed')
          : edits.saving || edits.pending
          ? t('barcode.save.saving')
          : counted
          ? t('barcode.count.countedN').replace('%s', String(counted))
          : undefined
      }
      onBack={leave}
    >
      {location ? (
        <View style={{ paddingHorizontal: s.lg, paddingBottom: s.md }}>
          <Button
            label={location.name}
            icon="location"
            variant="secondary"
            size="md"
            onPress={() => setLocationsOpen(true)}
            testID="count-location"
          />
        </View>
      ) : null}
    </Header>
  );

  let body;
  if (!data || !view) {
    body = query.error ? (
      <StateView
        kind={isOffline(query.error) ? 'offline' : 'error'}
        title={t('barcode.error.title')}
        body={errorText(query.error)}
        actionLabel={t('common.retry')}
        onAction={query.reload}
      />
    ) : (
      <StateView kind="loading" title={t('barcode.count.loading')} />
    );
  } else {
    body = (
      <FlatList
        ref={listRef}
        testID="count-lines"
        data={lines}
        keyExtractor={l => l.key}
        onScrollToIndexFailed={() => {}}
        contentContainerStyle={[styles.grow, { paddingBottom: s.xxl + 56 }]}
        ListHeaderComponent={
          <View>
            {awaitingLot ? (
              <View
                style={[
                  styles.banner,
                  {
                    marginHorizontal: s.lg,
                    marginTop: s.lg,
                    padding: s.md,
                    borderRadius: r.md,
                    borderColor: c.accent,
                    backgroundColor: c.surface,
                  },
                ]}
              >
                <Icon name="tag" color={c.accent} size={20} />
                <Text
                  style={[
                    type.bodyStrong,
                    styles.fill,
                    { color: c.text, marginLeft: s.sm },
                  ]}
                >
                  {t(
                    awaitingLot.tracking === 'serial'
                      ? 'barcode.picking.scanSerial'
                      : 'barcode.picking.scanLot',
                  ).replace('%s', awaitingLot.name)}
                </Text>
                <Button
                  label={t('common.cancel')}
                  variant="ghost"
                  size="md"
                  onPress={() => setAwaitingLot(null)}
                />
              </View>
            ) : null}
            <View
              style={{ paddingHorizontal: s.lg, paddingTop: s.lg, gap: s.md }}
            >
              <OverviewCard
                testID="count-overview"
                icon="count"
                label={t('barcode.count.overview')}
                total={lines.length}
                shares={[
                  {
                    label: t('barcode.count.shareCounted'),
                    value: progress.matching,
                    tone: 'success',
                  },
                  ...(data.showQuantity
                    ? [
                        {
                          label: t('barcode.count.shareDifferent'),
                          value: progress.different,
                          tone: 'warning' as const,
                        },
                      ]
                    : []),
                  {
                    label: t('barcode.count.shareTodo'),
                    value: progress.todo,
                    tone: 'neutral',
                  },
                ]}
                status={countStatus(lines.length, progress)}
              />
              <Button
                label={t('barcode.menu.search')}
                icon="search"
                variant="secondary"
                size="md"
                onPress={() => setChoices([])}
                testID="count-find"
              />
            </View>
            {lines.length ? (
              <SectionLabel
                label={`${t('barcode.count.products')} (${lines.length})`}
              />
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const p = productOf(item.productId);
          const lot = item.lotId ? data.lots[item.lotId]?.name : item.lotName;
          const first = index === 0;
          const last = index === lines.length - 1;
          const diff =
            data.showQuantity && item.inventoryQuantitySet
              ? item.inventoryQuantity - item.quantity
              : 0;
          return (
            <CardSegment
              edge={
                first && last
                  ? 'both'
                  : first
                  ? 'top'
                  : last
                  ? 'bottom'
                  : undefined
              }
            >
              {first ? null : <IconRowSeparator />}
              <ListRow
                testID={`count-line-${item.productId}`}
                title={p?.name ?? t('barcode.product.unknown')}
                subtitle={p ? productCodes(p) : undefined}
                meta={
                  [
                    lot,
                    data.showQuantity
                      ? t('barcode.count.onHand').replace(
                          '%s',
                          formatQty(item.quantity),
                        )
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                icon={
                  !item.inventoryQuantitySet
                    ? 'box'
                    : diff
                    ? 'warning'
                    : 'success'
                }
                iconTone={
                  !item.inventoryQuantitySet
                    ? 'neutral'
                    : diff
                    ? 'warning'
                    : 'success'
                }
                selected={selected === item.key}
                flashKey={flash[item.key]}
                onPress={() => setEditKey(item.key)}
                trailing={
                  <View style={styles.qty}>
                    <Text
                      style={[
                        type.title,
                        styles.tabular,
                        {
                          color: item.inventoryQuantitySet
                            ? c.text
                            : c.textFaint,
                        },
                      ]}
                      testID={`count-line-${item.productId}-qty`}
                    >
                      {item.inventoryQuantitySet
                        ? formatQty(item.inventoryQuantity)
                        : '—'}
                    </Text>
                    {diff ? (
                      <Badge
                        label={`${diff > 0 ? '+' : '−'}${formatQty(
                          Math.abs(diff),
                        )}`}
                        tone="warning"
                      />
                    ) : null}
                  </View>
                }
              />
            </CardSegment>
          );
        }}
      />
    );
  }

  const editing =
    editKey !== null
      ? view?.lines.find(l => l.key === resolveKey(editKey))
      : undefined;
  const locationList = data
    ? Object.values(data.locations)
        .filter(l => l.usage === 'internal')
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    <ScanLayout
      testID="barcode-count"
      contentKey={data && view ? 'data' : query.error ? 'error' : 'loading'}
      header={header}
      onCode={data && !applyOpen && !applying ? onCode : null}
      message={message}
      footer={
        // Nothing counted yet: nothing to apply.
        data && (counted || applying) ? (
          <Button
            label={t('barcode.count.applyN').replace('%s', String(counted))}
            icon="check"
            onPress={openApply}
            loading={applying}
            testID="count-apply"
          />
        ) : undefined
      }
      overlay={
        <>
          <Sheet
            visible={applyOpen}
            onClose={() => setApplyOpen(false)}
            title={t('barcode.count.applyTitle')}
            message={t('barcode.count.applyBody').replace(
              '%s',
              String(edits.view ? countedLines(edits.view).length : 0),
            )}
            testID="apply-sheet"
          >
            <Button
              label={t('barcode.count.applyConfirm')}
              onPress={apply}
              testID="apply-confirm"
            />
            <Button
              label={t('barcode.count.later')}
              variant="secondary"
              onPress={() => {
                setApplyOpen(false);
                show('success', t('barcode.count.saved'));
              }}
            />
          </Sheet>

          <Sheet
            visible={needsOdoo}
            onClose={() => setNeedsOdoo(false)}
            title={t('barcode.picking.needsOdooTitle')}
            message={t('barcode.picking.needsOdooBody')}
          >
            <Button
              label={t('barcode.odoo.open')}
              icon="external"
              onPress={() => {
                setNeedsOdoo(false);
                openInOdoo('/odoo/action-stock.action_view_inventory_tree');
              }}
            />
            <Button
              label={t('common.cancel')}
              variant="ghost"
              onPress={() => setNeedsOdoo(false)}
            />
          </Sheet>

          <Sheet
            visible={unsavedOnLeave}
            onClose={() => setUnsavedOnLeave(false)}
            title={t('barcode.save.unsavedTitle')}
            message={t('barcode.save.unsavedBody')}
          >
            <Button
              label={t('common.retry')}
              icon="refresh"
              onPress={() => {
                setUnsavedOnLeave(false);
                leave();
              }}
            />
            <Button
              label={t('barcode.save.leaveAnyway')}
              variant="danger"
              onPress={() => {
                setUnsavedOnLeave(false);
                if (!leavingRef.current) {
                  leavingRef.current = true;
                  nav.pop();
                }
              }}
            />
          </Sheet>

          <Sheet
            visible={editing !== undefined}
            onClose={() => setEditKey(null)}
            title={editing ? productOf(editing.productId)?.name ?? '' : ''}
            message={
              editing && data?.showQuantity
                ? t('barcode.count.onHand').replace(
                    '%s',
                    formatQty(editing.quantity),
                  )
                : t('barcode.count.editBody')
            }
            testID="count-edit-sheet"
          >
            {editing ? (
              <Stepper
                testID="count-qty"
                value={
                  editing.inventoryQuantitySet ? editing.inventoryQuantity : 0
                }
                onChange={qty => push({ type: 'set', key: editing.key, qty })}
              />
            ) : null}
            <Button
              label={t('common.close')}
              variant="secondary"
              onPress={() => setEditKey(null)}
            />
          </Sheet>

          <Sheet
            visible={locationsOpen}
            onClose={() => setLocationsOpen(false)}
            title={t('barcode.count.chooseLocation')}
            message={t('barcode.count.chooseLocationBody')}
          >
            <FlatList
              style={styles.sheetList}
              data={locationList}
              keyExtractor={l => String(l.id)}
              renderItem={({ item }) => (
                <ListRow
                  title={item.name}
                  icon="location"
                  iconTone={item.id === locationId ? 'accent' : 'neutral'}
                  selected={item.id === locationId}
                  onPress={() => {
                    setLocationsOpen(false);
                    setLocationId(item.id);
                  }}
                />
              )}
            />
          </Sheet>

          <ProductPickerSheet
            visible={choices !== null}
            initial={choices ?? undefined}
            title={
              choices?.length
                ? t('barcode.search.several')
                : t('barcode.search.title')
            }
            onClose={() => setChoices(null)}
            onPick={p => {
              setChoices(null);
              enqueue(() => handlers.current.handleProduct(p));
            }}
          />
        </>
      }
    >
      {body}
    </ScanLayout>
  );
}

/** The overview's foot: what to do next in this location. */
function countStatus(
  total: number,
  progress: { matching: number; different: number; todo: number },
): OverviewCardProps['status'] {
  if (!total) {
    return {
      tone: 'info',
      icon: 'scan',
      title: t('barcode.count.empty'),
      body: t('barcode.count.emptyBody'),
    };
  }
  if (progress.different) {
    return {
      tone: 'warning',
      icon: 'warning',
      title: t('barcode.count.statusDiff').replace(
        '%s',
        String(progress.different),
      ),
      body: t('barcode.count.statusDiffBody'),
    };
  }
  if (!progress.todo) {
    return {
      tone: 'success',
      icon: 'success',
      title: t('barcode.count.statusDone'),
      body: t('barcode.count.statusDoneBody'),
    };
  }
  return {
    tone: 'info',
    icon: 'scan',
    title: t('barcode.count.statusTodo').replace('%s', String(progress.todo)),
    body: t('barcode.count.statusTodoBody'),
  };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  qty: { alignItems: 'flex-end', gap: 2 },
  tabular: { fontVariant: ['tabular-nums'] },
  grow: { flexGrow: 1 },
  sheetList: { maxHeight: 360 },
  banner: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
});

export default CountScreen;
