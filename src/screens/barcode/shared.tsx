import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  findPickingsByOrigin,
  findProductsByReference,
  scanFromMainMenu,
  searchProducts,
} from '../../api/barcode';
import type { PickingSummary, Product } from '../../api/barcode';
import { odooRecordPath } from '../../api/odoo';
import { t } from '../../i18n';
import {
  errorText,
  isSessionError,
  useBarcode,
  useScanHandler,
  useScanMessages,
} from '../../navigation/barcodeContext';
import {
  Badge,
  Button,
  HeaderLayoutActions,
  ListRow,
  Screen,
} from '../../ui/primitives';
import type { HeaderAction } from '../../ui/primitives';
import { FadeIn } from '../../ui/motion';
import {
  ScanMessage,
  ScanProblemNotice,
  ScanToast,
  rejectFeedback,
} from '../../ui/scanFeedback';
import Sheet from '../../ui/Sheet';
import { useUi } from '../../ui/theme';
import { OPERATION_LOOK, STATE_LOOK } from './look';

// -----------------------------------------------------------------------------
// ScanLayout: header (+ manual entry) + content + scan toast + footer
// -----------------------------------------------------------------------------

type ScanLayoutProps = {
  header: ReactNode;
  children: ReactNode;
  /** Handles scans and manually typed codes. Null: scanning is off here. */
  onCode: ((code: string) => void) | null;
  /** Scans while `onCode` is null: say why nothing happens. */
  onIdleCode?: (code: string) => void;
  message: ScanMessage | null;
  /** Bottom actions (e.g. Validate). */
  footer?: ReactNode;
  /** Sheets etc., rendered on top of everything. */
  overlay?: ReactNode;
  /** The screen shows the scanner's state itself (no problem notice here). */
  showsScanner?: boolean;
  /**
   * What the content shows ('loading', 'error', 'data'...): when it changes,
   * the new content fades in instead of replacing the old one at once.
   */
  contentKey?: string;
  testID?: string;
};

export function ScanLayout({
  header,
  children,
  onCode,
  onIdleCode,
  message,
  footer,
  overlay,
  showsScanner = false,
  contentKey = '',
  testID,
}: ScanLayoutProps) {
  const { c, s } = useUi();
  const { scanner } = useBarcode();
  const [manualOpen, setManualOpen] = useState(false);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const scanning = onCode != null;

  // Manual entry: a keyboard button in the screen's header while scanning.
  const headerActions = useMemo<HeaderAction[]>(
    () =>
      scanning
        ? [
            {
              icon: 'keyboard',
              label: t('barcode.manual.open'),
              onPress: () => setManualOpen(true),
              testID: 'header-manual',
            },
          ]
        : [],
    [scanning],
  );

  return (
    <Screen testID={testID}>
      <HeaderLayoutActions.Provider value={headerActions}>
        {header}
      </HeaderLayoutActions.Provider>
      <View style={styles.fill}>
        <FadeIn key={contentKey} style={styles.fill} rise={8}>
          {children}
        </FadeIn>
        <ScanReceiver
          onCode={code => (onCode ?? onIdleCode)?.(code)}
          message={message}
        />
      </View>
      {scanning && !showsScanner && scanner.state === 'problem' ? (
        <ScanProblemNotice
          text={scanner.problemText ?? t('scanner.problem.error')}
          onRetry={scanner.restart}
        />
      ) : null}
      {footer ? (
        <FadeIn
          style={{
            paddingHorizontal: s.lg,
            paddingTop: s.md,
            paddingBottom: s.sm,
            backgroundColor: c.bg,
          }}
        >
          {footer}
        </FadeIn>
      ) : null}
      {overlay}
      <ManualCodeSheet
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
        onSubmit={code => {
          setManualOpen(false);
          onCodeRef.current?.(code);
        }}
      />
    </Screen>
  );
}

// -----------------------------------------------------------------------------
// ScanReceiver: the top screen's scans and the toast with their answers
// -----------------------------------------------------------------------------

/** A repeat read shows the answer again at most this often (a held label reads ~3×/s). */
export const REPLAY_GAP_MS = 1000;

/**
 * Receives the scans while its screen is on top and shows the answers
 * (`ScanToast`; render it bottom-aligned in the content area). The same label
 * read again moments later isn't a new item, but its last answer (accepted or
 * rejected) shows again, so a second scan never goes unanswered.
 */
export function ScanReceiver({
  onCode,
  message,
}: {
  onCode: (code: string) => void;
  message: ScanMessage | null;
}) {
  const [replay, setReplay] = useState<{
    of: ScanMessage;
    shown: ScanMessage;
  } | null>(null);
  const toast = replay && replay.of === message ? replay.shown : message;

  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const messageRef = useRef(message);
  messageRef.current = message;
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, [toast]);
  const replayCounter = useRef(0);
  /** The last code handled, and the message that was showing before it. */
  const lastScan = useRef<{ code: string; before: ScanMessage | null } | null>(
    null,
  );

  useScanHandler((raw, repeat) => {
    const code = raw.trim();
    if (!repeat) {
      lastScan.current = { code, before: messageRef.current };
      onCodeRef.current(code);
      return;
    }
    const answer = messageRef.current;
    const last = lastScan.current;
    if (
      !answer ||
      last?.code !== code ||
      answer === last.before || // still being handled: its answer will come
      Date.now() - shownAt.current < REPLAY_GAP_MS
    ) {
      return;
    }
    if (answer.tone === 'danger' || answer.tone === 'warning') {
      rejectFeedback();
    }
    setReplay({
      of: answer,
      shown: {
        id: -++replayCounter.current,
        tone: answer.tone,
        text:
          answer.tone === 'success'
            ? t('barcode.scan.again').replace('%s', answer.text)
            : answer.text,
      },
    });
  });

  return <ScanToast message={toast} />;
}

// -----------------------------------------------------------------------------
// Manual code entry
// -----------------------------------------------------------------------------

export function ManualCodeSheet({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
}) {
  const { c, r, s, type } = useUi();
  const [value, setValue] = useState('');
  useEffect(() => {
    if (visible) {
      setValue('');
    }
  }, [visible]);
  // Close the keyboard before the sheet goes: the lookup may open another
  // screen, which unmounts the focused field and Android leaves the keyboard
  // open over it.
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  const submit = () => {
    const code = value.trim();
    if (code) {
      Keyboard.dismiss();
      onSubmit(code);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t('barcode.manual.title')}
      message={t('barcode.manual.body')}
      testID="manual-sheet"
    >
      <TextInput
        testID="manual-input"
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="go"
        placeholder={t('barcode.manual.placeholder')}
        placeholderTextColor={c.textFaint}
        style={[
          type.mono,
          {
            color: c.text,
            backgroundColor: c.surfaceAlt,
            borderRadius: r.md,
            paddingHorizontal: s.lg,
          },
          styles.manualInput,
        ]}
      />
      <Button
        label={t('barcode.manual.submit')}
        onPress={submit}
        disabled={!value.trim()}
        testID="manual-submit"
      />
    </Sheet>
  );
}

// -----------------------------------------------------------------------------
// Product search / choice
// -----------------------------------------------------------------------------

type ProductPickerProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (product: Product) => void;
  /** Start with these (e.g. several products share a reference). */
  initial?: Product[];
  initialQuery?: string;
  title?: string;
};

export function ProductPickerSheet({
  visible,
  onClose,
  onPick,
  initial,
  initialQuery = '',
  title,
}: ProductPickerProps) {
  const { c, r, s, type } = useUi();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Product[]>(initial ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
      setResults(initial ?? []);
      setError(null);
    }
  }, [visible, initial, initialQuery]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      return;
    }
    const request = ++requestRef.current;
    const timer = setTimeout(() => {
      setBusy(true);
      searchProducts(q)
        .then(rows => {
          if (request === requestRef.current) {
            setResults(rows);
            setError(null);
          }
        })
        .catch(e => request === requestRef.current && setError(errorText(e)))
        .finally(() => request === requestRef.current && setBusy(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [query, visible]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title ?? t('barcode.search.title')}
      testID="product-picker"
    >
      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: c.surfaceAlt,
            borderRadius: r.md,
            paddingHorizontal: s.md,
          },
        ]}
      >
        <TextInput
          testID="product-search-input"
          value={query}
          onChangeText={setQuery}
          autoFocus={!initial?.length}
          placeholder={t('barcode.search.placeholder')}
          placeholderTextColor={c.textFaint}
          autoCorrect={false}
          style={[
            type.body,
            styles.fill,
            styles.searchInput,
            { color: c.text },
          ]}
        />
        {busy ? <ActivityIndicator color={c.textMuted} /> : null}
      </View>
      {error ? <ListRow title={error} icon="error" iconTone="danger" /> : null}
      <FlatList
        style={styles.results}
        keyboardShouldPersistTaps="handled"
        data={results}
        keyExtractor={p => String(p.id)}
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={productCodes(item)}
            icon="box"
            onPress={() => afterKeyboardHides(() => onPick(item))}
            chevron
          />
        )}
        ListEmptyComponent={
          query.trim().length >= 2 && !busy ? (
            <ListRow title={t('barcode.search.none')} icon="inbox" />
          ) : undefined
        }
      />
    </Sheet>
  );
}

/**
 * Closes the keyboard, then runs `next`. Navigating unmounts the focused
 * search field at once, and Android then leaves the keyboard open over the
 * next screen; waiting for it to hide avoids that.
 */
export function afterKeyboardHides(next: () => void) {
  if (!Keyboard.isVisible()) {
    next();
    return;
  }
  let done = false;
  const run = () => {
    if (!done) {
      done = true;
      sub.remove();
      clearTimeout(timer);
      next();
    }
  };
  const sub = Keyboard.addListener('keyboardDidHide', run);
  const timer = setTimeout(run, 400);
  Keyboard.dismiss();
}

/** "REF · 5412345678901", or what exists of it. */
export function productCodes(p: Pick<Product, 'code' | 'barcode'>): string {
  return (
    [...new Set([p.code, p.barcode].filter(Boolean))].join(' · ') ||
    t('barcode.product.noCode')
  );
}

// -----------------------------------------------------------------------------
// Transfer choice: several transfers share the scanned order number
// -----------------------------------------------------------------------------

export function PickingPickerSheet({
  visible,
  pickings,
  onClose,
  onPick,
}: {
  visible: boolean;
  pickings: PickingSummary[];
  onClose: () => void;
  onPick: (picking: PickingSummary) => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('barcode.pickings.several')}
      testID="picking-picker"
    >
      <FlatList
        style={styles.results}
        data={pickings}
        keyExtractor={p => String(p.id)}
        renderItem={({ item }) => {
          const look =
            OPERATION_LOOK[item.code ?? 'internal'] ?? OPERATION_LOOK.internal;
          const state = STATE_LOOK[item.state] ?? STATE_LOOK.draft;
          return (
            <ListRow
              testID={`picking-choice-${item.id}`}
              title={item.name}
              subtitle={item.partner ?? item.origin ?? undefined}
              meta={item.code ? t(`barcode.op.${item.code}`) : undefined}
              icon={look.icon}
              iconTone={look.tone}
              trailing={<Badge label={t(state.label)} tone={state.tone} />}
              chevron
              onPress={() => onPick(item)}
            />
          );
        }}
      />
    </Sheet>
  );
}

// -----------------------------------------------------------------------------
// Scans outside a transfer: the Barcode app's main-menu logic
// -----------------------------------------------------------------------------

type OdooTarget = { model: string; id: number } | null;

/**
 * Handles a scan like Odoo's Barcode main menu (open a transfer, start one
 * from an operation type or location, show a product's stock), plus what
 * Odoo lacks: a product found by its internal reference.
 */
export function useMainScan() {
  const { nav } = useBarcode();
  const { message, show } = useScanMessages();
  const [busy, setBusy] = useState(false);
  const [odooTarget, setOdooTarget] = useState<OdooTarget>(null);
  const [choices, setChoices] = useState<Product[] | null>(null);
  const [pickingChoices, setPickingChoices] = useState<PickingSummary[] | null>(
    null,
  );
  const busyRef = useRef(false);

  const openProduct = useCallback(
    (p: Product) => nav.push({ name: 'product', id: p.id, title: p.name }),
    [nav],
  );

  const handle = useCallback(
    async (code: string) => {
      if (!code || busyRef.current) {
        return;
      }
      busyRef.current = true;
      setBusy(true);
      try {
        const target = await scanFromMainMenu(code);
        switch (target.kind) {
          case 'picking':
            nav.push({ name: 'picking', id: target.id });
            return;
          case 'count':
            nav.push({ name: 'count' });
            return;
          case 'product':
            nav.push({ name: 'product', id: target.id, title: target.name });
            return;
          case 'odoo':
            setOdooTarget({ model: target.model, id: target.id });
            return;
        }
        // Odoo matched nothing: the app's own lookups, a product by its
        // internal reference or a transfer by its order number.
        const [byRef, byOrigin] = await Promise.all([
          findProductsByReference(code),
          findPickingsByOrigin(code),
        ]);
        if (byRef.length === 1) {
          openProduct(byRef[0]);
        } else if (byRef.length > 1) {
          setChoices(byRef);
        } else if (byOrigin.length === 1) {
          nav.push({ name: 'picking', id: byOrigin[0].id });
        } else if (byOrigin.length > 1) {
          setPickingChoices(byOrigin);
        } else {
          show(
            'danger',
            target.message || t('barcode.scan.unknown').replace('%s', code),
          );
        }
      } catch (e) {
        if (isSessionError(e)) {
          nav.signIn();
          return;
        }
        show('danger', errorText(e));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [nav, show, openProduct],
  );

  const sheets = (
    <>
      <Sheet
        visible={odooTarget !== null}
        onClose={() => setOdooTarget(null)}
        title={t('barcode.odoo.title')}
        message={t('barcode.odoo.body')}
      >
        <Button
          label={t('barcode.odoo.open')}
          icon="external"
          onPress={() => {
            const target = odooTarget;
            setOdooTarget(null);
            if (target) {
              nav.openOdoo(odooRecordPath(target.model, target.id));
            }
          }}
        />
        <Button
          label={t('common.cancel')}
          variant="ghost"
          onPress={() => setOdooTarget(null)}
        />
      </Sheet>
      <ProductPickerSheet
        visible={choices !== null}
        initial={choices ?? undefined}
        title={t('barcode.search.several')}
        onClose={() => setChoices(null)}
        onPick={p => {
          setChoices(null);
          openProduct(p);
        }}
      />
      <PickingPickerSheet
        visible={pickingChoices !== null}
        pickings={pickingChoices ?? []}
        onClose={() => setPickingChoices(null)}
        onPick={p => {
          setPickingChoices(null);
          nav.push({ name: 'picking', id: p.id });
        }}
      />
    </>
  );

  return { handle, busy, message, show, sheets };
}

const styles = StyleSheet.create({
  manualInput: { height: 56, fontSize: 18 },
  searchInput: { height: 52 },
  results: { maxHeight: 300 },
  fill: { flex: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center' },
});
