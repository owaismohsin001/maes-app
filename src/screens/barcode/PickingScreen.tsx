import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import {
  backordersOf,
  findProductsByReference,
  getPickingData,
  getPartner,
  getPickingSummary,
  getProduct,
  lookupBarcode,
  pickingStamp,
  pickingState,
  postBarcodeProcess,
  savePickingLines,
  validatePicking,
} from '../../api/barcode';
import type {
  Location,
  Lot,
  PartnerInfo,
  PickingData,
  PickingState,
  PickingSummary,
  Product,
} from '../../api/barcode';
import { odooRecordPath } from '../../api/odoo';
import { useLiveSync } from '../../hooks/useLiveSync';
import { useOdooQuery } from '../../hooks/useOdooQuery';
import { formatDateTime, isPast } from '../../utils/format';
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
  LineKey,
  PickingEvent,
  PickingView,
  ProductRow,
  aliasesAfterSave,
  applyPickingEvents,
  barcodeCommand,
  carryReserved,
  locationByBarcode,
  lotAlreadyUsed,
  pickingCommands,
  pickingProgress,
  productByBarcode,
  productRows,
  uncompletedRows,
} from '../../barcode/picking';
import { useSyncedEdits } from '../../barcode/useSyncedEdits';
import Icon from '../../ui/Icon';
import type { IconName } from '../../ui/Icon';
import {
  Button,
  Card,
  DetailCard,
  DetailRow,
  Header,
  ListRow,
  ProgressBar,
  Screen,
  Stepper,
  formatQty,
  RowSeparator,
} from '../../ui/primitives';
import { FadeIn, FlowArrows } from '../../ui/motion';
import Sheet from '../../ui/Sheet';
import StateView from '../../ui/StateView';
import { toneColors, useUi } from '../../ui/theme';
import {
  ProductPickerSheet,
  ScanLayout,
  ScanReceiver,
  productCodes,
} from './shared';
import PickingDone from './PickingDone';

type Props = { pickingId: number };

type Done = { backorders: { id: number; name: string }[] };

/** Pause between the last scan of a complete transfer and validating it. */
const AUTO_VALIDATE_MS = 900;

/**
 * One transfer (receipt, delivery or internal), like Odoo's Barcode picking
 * screen: scan products (and serials, locations), adjust quantities, validate.
 */
function PickingScreen({ pickingId }: Props) {
  const { c, s, type } = useUi();
  const { nav } = useBarcode();
  const { message, show } = useScanMessages();
  // The live-sync stamp is read with the data, so a change made right after
  // loading is still noticed (see "Live sync" below).
  const loadedStamp = useRef<string | undefined>(undefined);
  const query = useOdooQuery(async () => {
    const [d, stamp] = await Promise.all([
      getPickingData(pickingId),
      pickingStamp(pickingId).catch(() => undefined),
    ]);
    loadedStamp.current = stamp;
    return d;
  }, String(pickingId));
  /** Data live sync already put on screen itself: not reset again. */
  const syncedData = useRef<PickingData | null>(null);
  // Source document and scheduled date: not in get_barcode_data.
  const summary = useOdooQuery(
    () => getPickingSummary(pickingId),
    String(pickingId),
  );
  // The vendor (receipts) or customer (deliveries), once the summary names one.
  const partnerId = summary.data?.partnerId ?? null;
  const partner = useOdooQuery(
    () => (partnerId ? getPartner(partnerId) : Promise.resolve(null)),
    String(partnerId ?? ''),
  );

  // Products, locations and lots learned from lookups, until Odoo's own data has them.
  const extraProducts = useRef<Record<number, Product>>({});
  const extraLocations = useRef<Record<number, Location>>({});
  const extraLots = useRef<Record<number, Lot>>({});
  const withExtras = useCallback(
    (d: PickingData): PickingData => ({
      ...d,
      products: { ...extraProducts.current, ...d.products },
      locations: { ...extraLocations.current, ...d.locations },
      lots: { ...extraLots.current, ...d.lots },
    }),
    [],
  );

  const edits = useSyncedEdits<PickingData, PickingEvent, PickingView>({
    apply: (d, events, aliases) =>
      applyPickingEvents(withExtras(d), events, aliases),
    commands: pickingCommands,
    save: async (cmds, d) =>
      carryReserved(d, await savePickingLines(d.picking.id, cmds, d.groups)),
    aliasesAfterSave,
    onRejected: e => {
      show('danger', errorText(e));
      query.reload();
    },
  });
  const { reset, getData, getView, flush, push } = edits;
  useEffect(() => {
    if (query.data && query.data !== syncedData.current) {
      reset(query.data);
    }
  }, [query.data, reset]);

  const data = edits.data ? withExtras(edits.data) : null;
  const view = edits.view;
  const rows = useMemo(
    () => (data && view ? productRows(data, view) : []),
    // `data` is rebuilt every render; edits.data / view carry the changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edits.data, view],
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const progress = pickingProgress(rows);

  /**
   * Data and lines right now. Scan handlers run one after the other, often
   * before React re-renders, so they read these instead of render values.
   */
  const current = () => {
    const d = getData();
    const v = getView();
    return d && v ? { data: withExtras(d), view: v } : null;
  };

  // Scan state, as in Odoo's picking model (state for rendering, refs for handlers).
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<Record<number, number>>({});
  const [awaitingLot, setAwaitingLotState] = useState<Product | null>(null);
  const awaitingLotRef = useRef<Product | null>(null);
  const setAwaitingLot = (p: Product | null) => {
    awaitingLotRef.current = p;
    setAwaitingLotState(p);
  };
  const [source, setSourceState] = useState<Location | null>(null);
  const sourceRef = useRef<Location | null>(null);
  const sinceDest = useRef<LineKey[]>([]);
  const newKeyCounter = useRef(0);

  // Sheets and the end of the flow.
  const [extraConfirm, setExtraConfirm] = useState<Product | null>(null);
  const [editRow, setEditRow] = useState<number | null>(null);
  const [backorderRows, setBackorderRows] = useState<ProductRow[] | null>(null);
  const [needsOdoo, setNeedsOdoo] = useState(false);
  const [unsavedOnLeave, setUnsavedOnLeave] = useState(false);
  const [choices, setChoices] = useState<Product[] | null>(null);
  const [validating, setValidating] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const listRef = useRef<FlatList<ProductRow>>(null);
  // Set synchronously, so a second tap or a scan can't start it twice.
  const validatingRef = useRef(false);
  const leavingRef = useRef(false);

  const isClosed = (d: PickingData) =>
    d.picking.state === 'done' || d.picking.state === 'cancel';
  const closed = data ? isClosed(data) : false;

  const productName = (id: number) =>
    data?.products[id]?.name ?? t('barcode.product.unknown');

  const highlight = (productId: number) => {
    setSelected(productId);
    setFlash(f => ({ ...f, [productId]: (f[productId] ?? 0) + 1 }));
    // After the row exists (a new product appears on the next render).
    setTimeout(() => {
      const index = rowsRef.current.findIndex(r => r.productId === productId);
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
    if (!getData()?.products[p.id]) {
      extraProducts.current[p.id] = p;
    }
    const newKey = `v:${++newKeyCounter.current}`;
    push({
      type: 'add',
      productId: p.id,
      qty: 1,
      lotId: lot.lotId ?? null,
      lotName: lot.lotName ?? null,
      locationId: sourceRef.current?.id ?? null,
      newKey,
    });
    sinceDest.current.push(newKey);
    highlight(p.id);
    const lotText =
      lot.lotName ??
      (lot.lotId
        ? extraLots.current[lot.lotId]?.name ?? getData()?.lots[lot.lotId]?.name
        : null);
    show('success', lotText ? `${p.name} · ${lotText}` : `+1 ${p.name}`);
  };

  const handleProduct = (p: Product, confirmedExtra = false) => {
    const cur = current();
    if (!cur) {
      return;
    }
    const { data: d, view: v } = cur;
    const inTransfer =
      d.moves.some(m => m.productId === p.id) ||
      v.lines.some(l => l.productId === p.id);
    if (!inTransfer && d.moves.length > 0 && !confirmedExtra) {
      if (!d.config.allowExtraProduct) {
        show(
          'danger',
          t('barcode.picking.notInTransfer').replace('%s', p.name),
        );
        return;
      }
      setExtraConfirm(p);
      return;
    }
    const tracked =
      p.tracking !== 'none' &&
      d.groups.lots &&
      (d.picking.useCreateLots || d.picking.useExistingLots);
    if (tracked) {
      if (!d.products[p.id]) {
        extraProducts.current[p.id] = p;
      }
      setAwaitingLot(p);
      highlight(p.id);
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
    addUnit(p);
  };

  const handleLot = async (p: Product, code: string) => {
    const cur = current();
    if (!cur) {
      return;
    }
    const { data: d, view: v } = cur;
    if (p.tracking === 'serial' && lotAlreadyUsed(d, v, p.id, code)) {
      show('warning', t('barcode.picking.serialUsed').replace('%s', code));
      return;
    }
    let lot = Object.values(d.lots).find(
      l => l.name === code && l.productId === p.id,
    );
    if (!lot && d.picking.useExistingLots) {
      const found = await lookupBarcode(code);
      lot = found.lots.find(l => l.productId === p.id);
      if (lot) {
        extraLots.current[lot.id] = lot;
      }
    }
    if (lot && d.picking.useExistingLots) {
      addUnit(p, { lotId: lot.id });
    } else if (d.picking.useCreateLots) {
      addUnit(p, { lotName: code });
    } else {
      show('danger', t('barcode.picking.unknownLot').replace('%s', code));
    }
  };

  const handleLocation = (loc: Location) => {
    const cur = current();
    if (!cur) {
      return;
    }
    const { data: d } = cur;
    const inDest = d.destLocationIds.includes(loc.id);
    const inSource = d.sourceLocationIds.includes(loc.id);
    const destAllowed =
      d.groups.multiLocations && d.config.restrictScanDestLocation !== 'no';
    if (inDest && destAllowed && sinceDest.current.length) {
      // The event keeps the scans' own keys; replay finds their lines.
      push({ type: 'dest', keys: sinceDest.current, locationId: loc.id });
      sinceDest.current = [];
      show('success', t('barcode.picking.putIn').replace('%s', loc.name));
      return;
    }
    if (inSource) {
      sourceRef.current = loc;
      setSourceState(loc);
      setAwaitingLot(null);
      show('info', t('barcode.picking.pickFrom').replace('%s', loc.name));
      return;
    }
    if (inDest) {
      show('info', t('barcode.picking.scanProductsFirst'));
      return;
    }
    show('danger', t('barcode.picking.wrongLocation').replace('%s', loc.name));
  };

  // -------------------------------------------------------------------------
  // Validate and leave
  // -------------------------------------------------------------------------

  const stopValidating = () => {
    validatingRef.current = false;
    setValidating(false);
  };

  const finishValidate = async () => {
    const d = getData();
    if (!d) {
      return;
    }
    validatingRef.current = true;
    setValidating(true);
    let finished = false;
    try {
      await flush();
      const result = await validatePicking(d.picking.id, {
        isReturn: d.picking.isReturn,
      });
      if (result.kind === 'action') {
        setNeedsOdoo(true);
        return;
      }
      const state = await pickingState(d.picking.id);
      if (state !== 'done') {
        setNeedsOdoo(true);
        return;
      }
      const backorders = await backordersOf(d.picking.id);
      finished = true; // no more scans or saves on a done transfer
      setDone({ backorders });
    } catch (e) {
      if (isSessionError(e)) {
        nav.signIn();
        return;
      }
      show('danger', errorText(e));
    } finally {
      if (finished) {
        setValidating(false);
      } else {
        stopValidating();
      }
    }
  };

  const validate = async () => {
    const d0 = getData();
    if (validatingRef.current || !d0 || isClosed(d0)) {
      return;
    }
    validatingRef.current = true;
    setValidating(true);
    try {
      await flush();
    } catch (e) {
      stopValidating();
      show('danger', errorText(e));
      return;
    }
    const cur = current();
    if (!cur) {
      stopValidating();
      return;
    }
    const r = productRows(cur.data, cur.view);
    const anyDone = r.some(row => row.done > 0);
    if (!anyDone && !cur.data.config.validationFull) {
      stopValidating();
      show('warning', t('barcode.picking.scanFirst'));
      return;
    }
    const short = uncompletedRows(r);
    stopValidating();
    if (
      anyDone &&
      short.length &&
      cur.data.config.createBackorder === 'ask' &&
      !cur.data.picking.isReturn
    ) {
      setBackorderRows(short);
      return;
    }
    await finishValidate();
  };

  // Everything scanned: validate by itself, after a moment to see the last
  // line turn green. A partial transfer still needs the button (backorder?).
  const autoValidated = useRef(false);
  const autoReady =
    progress.complete &&
    progress.done > 0 &&
    !closed &&
    !awaitingLot &&
    editRow === null &&
    extraConfirm === null &&
    choices === null &&
    data?.config.restrictScanDestLocation !== 'mandatory';
  useEffect(() => {
    if (!autoReady) {
      autoValidated.current = false;
      return;
    }
    if (autoValidated.current) {
      return;
    }
    const timer = setTimeout(() => {
      autoValidated.current = true;
      show('info', t('barcode.picking.autoValidate'));
      validate();
    }, AUTO_VALIDATE_MS);
    return () => clearTimeout(timer);
    // Only when the transfer becomes complete; `validate` reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReady]);

  const leave = async () => {
    if (leavingRef.current) {
      return;
    }
    leavingRef.current = true;
    if (done || !getData()) {
      nav.pop();
      return;
    }
    try {
      const latest = await flush();
      if (latest) {
        postBarcodeProcess(latest).catch(() => {});
      }
      nav.pop();
    } catch {
      leavingRef.current = false;
      setUnsavedOnLeave(true);
    }
  };

  /** Save first, then show the transfer in Odoo's web client. */
  const openInOdoo = async () => {
    const d = getData();
    if (!d) {
      return;
    }
    try {
      await flush();
    } catch (e) {
      show('danger', errorText(e));
      return;
    }
    nav.openOdoo(odooRecordPath('stock.picking', d.picking.id));
  };

  useBackHandler(() => {
    leave();
    return true;
  });

  // -------------------------------------------------------------------------
  // Scans
  // -------------------------------------------------------------------------

  const handleCode = async (code: string) => {
    const cur = current();
    if (!cur || !code || validatingRef.current || leavingRef.current) {
      return;
    }
    const { data: d } = cur;
    if (isClosed(d)) {
      show('warning', t('barcode.picking.closed'));
      return;
    }
    const command = barcodeCommand(code);
    if (command === 'validate') {
      await validate();
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
    let product = loc ? null : productByBarcode(d.products, code);
    const lotFor = awaitingLotRef.current;
    if (!loc && !product && lotFor) {
      await handleLot(lotFor, code);
      return;
    }
    if (!loc && !product) {
      const found = await lookupBarcode(code);
      product = found.products[0] ?? null;
      loc = product ? null : found.locations[0] ?? null;
      if (loc) {
        extraLocations.current[loc.id] = loc;
      }
      if (!product && !loc && found.lots.length && d.groups.lots) {
        const lot = found.lots[0];
        const owner = lot.productId ? await getProduct(lot.productId) : null;
        if (owner) {
          extraLots.current[lot.id] = lot;
          addUnit(owner, { lotId: lot.id });
          return;
        }
      }
      if (!product && !loc && found.pickings.length) {
        show(
          'warning',
          t('barcode.picking.otherTransfer').replace(
            '%s',
            found.pickings[0].name,
          ),
        );
        return;
      }
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
      handleLocation(loc);
    } else if (product) {
      handleProduct(product);
    } else {
      show('danger', t('barcode.scan.unknown').replace('%s', code));
    }
  };

  // Scans (and choices from sheets) are handled one at a time, in order,
  // each by the latest handler.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const queued = useRef(0);
  const handlers = useRef({ handleCode, handleProduct });
  handlers.current = { handleCode, handleProduct };
  const enqueue = useCallback(
    (task: () => void | Promise<void>) => {
      queued.current++;
      queue.current = queue.current
        .then(task)
        .catch(e => {
          if (isSessionError(e)) {
            nav.signIn();
          } else {
            show('danger', errorText(e));
          }
        })
        .finally(() => {
          queued.current--;
        });
    },
    [nav, show],
  );

  // Live sync: changes made in Odoo while the transfer is open (lines added
  // to the order, quantities changed, another device scanning) show up here.
  // Fresh data replaces the screen's only when the user is between scans
  // with everything saved; otherwise the next check tries again.
  const canRefresh = () => {
    const d = getData();
    const destPending =
      !!d &&
      d.groups.multiLocations &&
      d.config.restrictScanDestLocation !== 'no' &&
      sinceDest.current.length > 0;
    return (
      edits.isIdle() &&
      queued.current === 0 &&
      !validatingRef.current &&
      !leavingRef.current &&
      !destPending &&
      !awaitingLotRef.current &&
      extraConfirm === null &&
      editRow === null &&
      backorderRows === null &&
      choices === null &&
      !needsOdoo &&
      !unsavedOnLeave
    );
  };
  // Read after an await: the latest render's state, not the one that started.
  const canRefreshRef = useRef(canRefresh);
  canRefreshRef.current = canRefresh;
  const sync = useLiveSync({
    enabled: !!query.data && !closed && !done && !validating,
    stamp: () => pickingStamp(pickingId),
    onChange: async () => {
      if (!canRefreshRef.current()) {
        return false;
      }
      const before = getData();
      const fresh = await getPickingData(pickingId);
      // A scan saved meanwhile makes `fresh` older than the screen.
      if (getData() !== before || !canRefreshRef.current()) {
        return false;
      }
      // Reset here, not in an effect after the next render: a scan arriving
      // in between would be dropped by that reset.
      syncedData.current = fresh;
      reset(fresh);
      query.setData(fresh);
      summary.reload();
      show('info', t('barcode.sync.updated'));
      return true;
    },
  });
  const { rebase } = sync;
  // Loaded or reloaded: the screen shows Odoo's data as of the stamp read
  // with it. Live sync's own reloads have set theirs already.
  useEffect(() => {
    if (query.data && query.data !== syncedData.current) {
      rebase(loadedStamp.current);
    }
  }, [query.data, rebase]);
  // The app's own saves change the moves too; their answer is fresh data.
  const wasSaving = useRef(false);
  useEffect(() => {
    if (wasSaving.current && !edits.saving) {
      rebase();
    }
    wasSaving.current = edits.saving;
  }, [edits.saving, rebase]);
  const onCode = useCallback(
    (code: string) => enqueue(() => handlers.current.handleCode(code)),
    [enqueue],
  );
  /** Scans while scanning is off: say why nothing happens. */
  const onIdleCode = () => {
    if (done && data) {
      show(
        'success',
        t('barcode.picking.alreadyValidated').replace('%s', data.picking.name),
      );
    } else if (closed) {
      show('warning', t('barcode.picking.closed'));
    } else if (validating) {
      show('info', t('barcode.picking.busyValidating'));
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (done && data) {
    return (
      <Screen testID="picking-done">
        <Header title={data.picking.name} onBack={nav.pop} />
        <View style={styles.fill}>
          <PickingDone
            code={data.picking.code}
            name={data.picking.name}
            partner={
              data.picking.partnerId
                ? data.partners[data.picking.partnerId] ?? null
                : null
            }
            rows={rows}
            route={
              <RouteFlow
                code={data.picking.code}
                from={
                  source?.name ??
                  (data.picking.locationId
                    ? data.locations[data.picking.locationId]?.name
                    : null)
                }
                to={
                  data.picking.locationDestId
                    ? data.locations[data.picking.locationDestId]?.name
                    : null
                }
                sourceScanned={!!source}
              />
            }
            backorders={done.backorders}
            onOpenBackorder={id => nav.replace({ name: 'picking', id })}
            onBack={nav.pop}
          />
          <ScanReceiver onCode={onIdleCode} message={message} />
        </View>
      </Screen>
    );
  }

  const header = (
    <Header
      title={data?.picking.name ?? t('barcode.picking.title')}
      subtitle={
        edits.saveError
          ? t('barcode.save.failed')
          : edits.saving || edits.pending
          ? t('barcode.save.saving')
          : data?.picking.partnerId
          ? data.partners[data.picking.partnerId]
          : undefined
      }
      onBack={leave}
      actions={
        data
          ? [
              {
                icon: 'external',
                label: t('barcode.odoo.open'),
                onPress: openInOdoo,
                testID: 'picking-open-odoo',
              },
            ]
          : []
      }
    >
      {data && rows.length ? (
        <View style={{ paddingHorizontal: s.lg, paddingBottom: s.md }}>
          <View style={styles.progressText}>
            <Text style={[type.caption, { color: c.textMuted }]}>
              {t('barcode.picking.progress')}
            </Text>
            <Text
              style={[
                type.caption,
                { color: c.text, fontVariant: ['tabular-nums'] },
              ]}
            >
              {formatQty(progress.done)} / {formatQty(progress.demand)}
            </Text>
          </View>
          <ProgressBar value={progress.done} total={progress.demand} />
        </View>
      ) : null}
    </Header>
  );

  let body;
  if (!data || !view) {
    body = query.error ? (
      isSessionError(query.error) ? (
        <StateView
          kind="error"
          title={t('barcode.session.title')}
          body={t('barcode.session.body')}
          actionLabel={t('barcode.session.signIn')}
          onAction={nav.signIn}
        />
      ) : (
        <StateView
          kind={isOffline(query.error) ? 'offline' : 'error'}
          title={t('barcode.error.title')}
          body={errorText(query.error)}
          actionLabel={t('common.retry')}
          onAction={query.reload}
        />
      )
    ) : (
      <StateView kind="loading" />
    );
  } else {
    const p = data.picking;
    const from = p.locationId ? data.locations[p.locationId]?.name : null;
    const to = p.locationDestId ? data.locations[p.locationDestId]?.name : null;
    body = (
      <FlatList
        ref={listRef}
        testID="picking-lines"
        data={rows}
        keyExtractor={r => r.key}
        onScrollToIndexFailed={() => {}}
        contentContainerStyle={{ paddingBottom: s.xxl + 56 }}
        ListHeaderComponent={
          <View style={{ padding: s.lg, gap: s.md }}>
            {closed ? <ClosedBanner state={p.state} /> : null}
            <Card>
              <RouteFlow
                code={p.code}
                from={source?.name ?? from}
                to={to}
                sourceScanned={!!source}
              />
              {summary.data ? (
                <PickingFacts
                  summary={summary.data}
                  code={p.code}
                  closed={closed}
                />
              ) : null}
            </Card>
            {partner.data ? (
              <PartnerCard partner={partner.data} code={p.code} />
            ) : null}
            {p.note ? (
              <Card style={{ padding: s.md }}>
                <Text style={[type.label, { color: c.textMuted }]}>
                  {t('barcode.picking.note')}
                </Text>
                <Text style={[type.body, { color: c.text, marginTop: s.xs }]}>
                  {p.note}
                </Text>
              </Card>
            ) : null}
            {awaitingLot ? (
              <Card style={{ padding: s.md, borderColor: c.accent }}>
                <View style={styles.route}>
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
              </Card>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <StateView
            kind="empty"
            title={t('barcode.picking.empty')}
            body={t('barcode.picking.emptyBody')}
          />
        }
        ItemSeparatorComponent={RowSeparator}
        renderItem={({ item }) => (
          <ProductLine
            row={item}
            product={data.products[item.productId]}
            fallbackName={productName(item.productId)}
            uom={
              data.products[item.productId]?.uomId
                ? data.uoms[data.products[item.productId]!.uomId!]
                : undefined
            }
            selected={selected === item.productId}
            flashKey={flash[item.productId]}
            onPress={closed ? undefined : () => setEditRow(item.productId)}
          />
        )}
      />
    );
  }

  const editing =
    editRow !== null ? rows.find(r => r.productId === editRow) : undefined;

  return (
    <ScanLayout
      testID="barcode-picking"
      contentKey={data && view ? 'data' : query.error ? 'error' : 'loading'}
      header={header}
      onCode={data && !closed && !validating && !done ? onCode : null}
      onIdleCode={onIdleCode}
      message={message}
      footer={
        data && !closed ? (
          <Button
            label={t('barcode.picking.validate')}
            icon="check"
            onPress={validate}
            loading={validating}
            variant="success"
            testID="picking-validate"
          />
        ) : undefined
      }
      overlay={
        <>
          <Sheet
            visible={extraConfirm !== null}
            onClose={() => setExtraConfirm(null)}
            title={t('barcode.picking.extraTitle')}
            message={t('barcode.picking.extraBody').replace(
              '%s',
              extraConfirm?.name ?? '',
            )}
            testID="extra-sheet"
          >
            <Button
              label={t('barcode.picking.extraAdd')}
              onPress={() => {
                const p = extraConfirm;
                setExtraConfirm(null);
                if (p) {
                  enqueue(() => handlers.current.handleProduct(p, true));
                }
              }}
              testID="extra-add"
            />
            <Button
              label={t('common.cancel')}
              variant="ghost"
              onPress={() => setExtraConfirm(null)}
            />
          </Sheet>

          <Sheet
            visible={backorderRows !== null}
            onClose={() => setBackorderRows(null)}
            title={t('barcode.backorder.title')}
            message={t('barcode.backorder.body')}
            testID="backorder-sheet"
          >
            <Card>
              {(backorderRows ?? []).slice(0, 4).map(r => (
                <ListRow
                  key={r.key}
                  title={productName(r.productId)}
                  trailing={`${formatQty(r.done)} / ${formatQty(r.demand)}`}
                />
              ))}
            </Card>
            {(backorderRows?.length ?? 0) > 4 ? (
              <Text style={[type.caption, { color: c.textMuted }]}>
                {t('barcode.backorder.more').replace(
                  '%s',
                  String((backorderRows?.length ?? 0) - 4),
                )}
              </Text>
            ) : null}
            <Button
              label={t('barcode.backorder.validate')}
              variant="success"
              onPress={() => {
                setBackorderRows(null);
                finishValidate();
              }}
              testID="backorder-validate"
            />
            <Button
              label={t('barcode.backorder.stay')}
              variant="ghost"
              onPress={() => setBackorderRows(null)}
            />
          </Sheet>

          <Sheet
            visible={needsOdoo}
            onClose={() => setNeedsOdoo(false)}
            title={t('barcode.picking.needsOdooTitle')}
            message={t('barcode.picking.needsOdooBody')}
            testID="needs-odoo-sheet"
          >
            <Button
              label={t('barcode.odoo.open')}
              icon="external"
              onPress={() => {
                setNeedsOdoo(false);
                openInOdoo();
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
            onClose={() => setEditRow(null)}
            title={editing ? productName(editing.productId) : ''}
            message={
              editing
                ? t('barcode.picking.demand').replace(
                    '%s',
                    formatQty(editing.demand),
                  )
                : undefined
            }
            testID="line-sheet"
          >
            {(editing?.lines ?? []).map((line, i) => {
              const lot = line.lotId
                ? data?.lots[line.lotId]?.name
                : line.lotName;
              const loc = line.locationId
                ? data?.locations[line.locationId]?.name
                : null;
              return (
                <View key={line.key} style={{ gap: s.xs }}>
                  {editing && editing.lines.length > 1 ? (
                    <Text
                      style={[type.caption, { color: c.textMuted }]}
                      numberOfLines={1}
                    >
                      {[lot, loc].filter(Boolean).join(' · ') || `#${i + 1}`}
                    </Text>
                  ) : lot ? (
                    <Text style={[type.caption, { color: c.textMuted }]}>
                      {lot}
                    </Text>
                  ) : null}
                  <Stepper
                    testID={`line-qty-${i}`}
                    value={line.qtyDone}
                    onChange={qty => push({ type: 'set', key: line.key, qty })}
                  />
                </View>
              );
            })}
            <Button
              label={t('common.close')}
              variant="secondary"
              onPress={() => setEditRow(null)}
            />
          </Sheet>

          <ProductPickerSheet
            visible={choices !== null}
            initial={choices ?? undefined}
            title={t('barcode.search.several')}
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

/**
 * Where the goods go: an icon for each end with the moving chevrons between
 * them, the names underneath (From left, To right).
 */
function RouteFlow({
  code,
  from,
  to,
  sourceScanned,
}: {
  code: string;
  from: string | null | undefined;
  to: string | null | undefined;
  /** The user scanned the source location: it's the one picked from now. */
  sourceScanned: boolean;
}) {
  const { c, s } = useUi();
  return (
    <View style={{ padding: s.md }} testID="picking-route">
      <View style={styles.route}>
        <RouteIcon
          icon={code === 'incoming' ? 'truck' : 'warehouse'}
          active={sourceScanned}
        />
        <View style={[styles.fill, styles.flow]}>
          <FlowArrows
            color={c.accent}
            size={24}
            testID="picking-route-arrows"
          />
        </View>
        <RouteIcon icon={code === 'outgoing' ? 'truck' : 'warehouse'} />
      </View>
      <View style={[styles.routeNames, { marginTop: s.sm, gap: s.lg }]}>
        <RouteName label={t('barcode.picking.from')} value={from} />
        <RouteName label={t('barcode.picking.to')} value={to} end />
      </View>
    </View>
  );
}

function RouteIcon({
  icon,
  active = false,
}: {
  icon: IconName;
  active?: boolean;
}) {
  const { c } = useUi();
  return (
    <View
      style={[
        styles.routeIcon,
        { backgroundColor: active ? c.accent : c.accentSoft },
      ]}
    >
      <Icon name={icon} color={active ? c.surface : c.accent} size={22} />
    </View>
  );
}

function RouteName({
  label,
  value,
  end = false,
}: {
  label: string;
  value: string | null | undefined;
  /** Right-aligned (the destination). */
  end?: boolean;
}) {
  const { c, type } = useUi();
  const align = end ? styles.right : null;
  return (
    <View style={styles.fill}>
      <Text style={[type.caption, align, { color: c.textMuted }]}>{label}</Text>
      <Text
        style={[type.bodyStrong, align, { color: c.text }]}
        numberOfLines={2}
      >
        {value ?? '—'}
      </Text>
    </View>
  );
}

/** A done or cancelled transfer: says so first, before anything else. */
function ClosedBanner({ state }: { state: PickingState }) {
  const { c, s, type } = useUi();
  const done = state === 'done';
  const tone = toneColors(c, done ? 'success' : 'neutral');
  return (
    <FadeIn rise={8}>
      <Card
        style={{
          padding: s.md,
          backgroundColor: tone.bg,
          borderColor: tone.bg,
        }}
      >
        <View style={[styles.route, { gap: s.md }]} testID="picking-closed">
          <View style={[styles.bannerIcon, { backgroundColor: c.surface }]}>
            <Icon
              name={done ? 'check' : 'close'}
              color={tone.fg}
              size={24}
              strokeWidth={2.5}
            />
          </View>
          <View style={styles.fill}>
            <Text style={[type.heading, { color: c.text }]}>
              {t(
                done
                  ? 'barcode.picking.validated'
                  : 'barcode.picking.cancelled',
              )}
            </Text>
            <Text style={[type.body, { color: c.textMuted, marginTop: s.xs }]}>
              {t('barcode.picking.closed')}
            </Text>
          </View>
        </View>
      </Card>
    </FadeIn>
  );
}

/** Dates and source document under the route, two per line. */
function PickingFacts({
  summary,
  code,
  closed,
}: {
  summary: PickingSummary;
  code: string;
  closed: boolean;
}) {
  const { c, s } = useUi();
  const facts: React.ComponentProps<typeof Fact>[] = [];
  if (summary.doneAt) {
    facts.push({
      icon: 'success',
      label: t(
        code === 'incoming'
          ? 'barcode.picking.received'
          : code === 'outgoing'
          ? 'barcode.picking.delivered'
          : 'barcode.picking.doneOn',
      ),
      value: formatDateTime(summary.doneAt),
      testID: 'picking-done-at',
    });
  }
  if (summary.scheduled) {
    facts.push({
      icon: 'calendar',
      label: t('barcode.picking.scheduled'),
      value: formatDateTime(summary.scheduled),
      danger: !closed && isPast(summary.scheduled),
    });
  }
  if (summary.origin) {
    facts.push({
      icon: 'tag',
      label: t('barcode.picking.origin'),
      value: summary.origin,
    });
  }
  const lines: (typeof facts)[] = [];
  for (let i = 0; i < facts.length; i += 2) {
    lines.push(facts.slice(i, i + 2));
  }
  return (
    <>
      {lines.map((line, i) => (
        <View
          key={i}
          style={[
            styles.route,
            styles.facts,
            { borderTopColor: c.border, padding: s.md, gap: s.md },
          ]}
        >
          <Fact {...line[0]} />
          {line[1] ? (
            <>
              <View
                style={[styles.factDivider, { backgroundColor: c.border }]}
              />
              <Fact {...line[1]} />
            </>
          ) : null}
        </View>
      ))}
    </>
  );
}

/** Who the goods come from (receipt) or go to (delivery), and how to reach them. */
function PartnerCard({
  partner,
  code,
}: {
  partner: PartnerInfo;
  code: string;
}) {
  return (
    <DetailCard
      title={t(
        code === 'incoming'
          ? 'barcode.partner.vendor'
          : code === 'outgoing'
          ? 'barcode.partner.customer'
          : 'barcode.partner.contact',
      )}
      flush
      testID="picking-partner"
    >
      <DetailRow
        icon="building"
        label={t('barcode.partner.name')}
        value={partner.name}
      />
      {partner.contact ? (
        <DetailRow
          icon="user"
          label={t('barcode.partner.person')}
          value={partner.contact}
        />
      ) : null}
      {partner.phone ? (
        <DetailRow
          icon="phone"
          label={t('barcode.partner.phone')}
          value={partner.phone}
          onPress={() =>
            Linking.openURL(
              `tel:${partner.phone!.replace(/[^\d+]/g, '')}`,
            ).catch(() => {})
          }
          testID="partner-phone"
        />
      ) : null}
      {partner.email ? (
        <DetailRow
          icon="mail"
          label={t('barcode.partner.email')}
          value={partner.email}
          onPress={() =>
            Linking.openURL(`mailto:${partner.email}`).catch(() => {})
          }
          testID="partner-email"
        />
      ) : null}
      {partner.address ? (
        <DetailRow
          icon="location"
          label={t('barcode.partner.address')}
          value={partner.address}
        />
      ) : null}
      {partner.vat ? (
        <DetailRow
          half
          mono
          icon="hash"
          label={t('barcode.partner.vat')}
          value={partner.vat}
        />
      ) : null}
      {partner.ref ? (
        <DetailRow
          half
          mono
          icon="tag"
          label={t('barcode.partner.ref')}
          value={partner.ref}
        />
      ) : null}
    </DetailCard>
  );
}

/** One header fact (date, source document): icon, label and value. */
function Fact({
  icon,
  label,
  value,
  danger = false,
  testID,
}: {
  icon: IconName;
  label: string;
  value: string;
  danger?: boolean;
  testID?: string;
}) {
  const { c, r, type } = useUi();
  return (
    <View style={[styles.route, styles.fill]} testID={testID}>
      <View
        style={[
          styles.factIcon,
          {
            backgroundColor: danger ? c.dangerSoft : c.accentSoft,
            borderRadius: r.sm,
          },
        ]}
      >
        <Icon name={icon} color={danger ? c.danger : c.accent} size={16} />
      </View>
      <View style={styles.fill}>
        <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[type.label, { color: danger ? c.danger : c.text }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function ProductLine({
  row,
  product,
  fallbackName,
  uom,
  selected,
  flashKey,
  onPress,
}: {
  row: ProductRow;
  product: Product | undefined;
  fallbackName: string;
  uom?: string;
  selected: boolean;
  flashKey?: number;
  onPress?: () => void;
}) {
  const { c, s, type } = useUi();
  const complete = row.demand > 0 && row.done >= row.demand;
  const over = row.demand > 0 && row.done > row.demand;
  const meta = row.lots.length
    ? row.lots.slice(0, 3).join(', ') +
      (row.lots.length > 3 ? ` +${row.lots.length - 3}` : '')
    : undefined;
  return (
    <ListRow
      testID={`line-${row.productId}`}
      title={product?.name ?? fallbackName}
      subtitle={product ? productCodes(product) : undefined}
      meta={meta}
      icon={complete ? 'success' : row.extra ? 'plus' : 'box'}
      iconTone={
        over ? 'warning' : complete ? 'success' : row.extra ? 'info' : 'neutral'
      }
      selected={selected}
      flashKey={flashKey}
      onPress={onPress}
      trailing={
        <View style={styles.qty}>
          <Text
            style={[
              type.mono,
              { color: over ? c.warning : complete ? c.success : c.text },
            ]}
            testID={`line-${row.productId}-qty`}
          >
            {formatQty(row.done)}
            <Text style={{ color: c.textFaint }}>
              {row.extra ? '' : ` / ${formatQty(row.demand)}`}
            </Text>
          </Text>
          {uom ? (
            <Text
              style={[type.caption, { color: c.textFaint }]}
              numberOfLines={1}
            >
              {uom}
            </Text>
          ) : null}
          {!row.extra ? (
            <View style={[styles.qtyBar, { marginTop: s.xs }]}>
              <ProgressBar value={row.done} total={row.demand} />
            </View>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  facts: { borderTopWidth: StyleSheet.hairlineWidth },
  factDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  factIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flow: { alignItems: 'center' },
  routeNames: { flexDirection: 'row', alignItems: 'flex-start' },
  routeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: { textAlign: 'right' },
  bannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: { alignItems: 'flex-end', minWidth: 72 },
  qtyBar: { width: 64 },
  fill: { flex: 1 },
  route: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
});

export default PickingScreen;
