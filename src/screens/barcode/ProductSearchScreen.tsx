import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { searchProductPage } from '../../api/barcode';
import type { ProductHit, ProductSearchFilter } from '../../api/barcode';
import { t } from '../../i18n';
import {
  errorText,
  isOffline,
  isSessionError,
  useBarcode,
  useScanMessages,
} from '../../navigation/barcodeContext';
import Icon from '../../ui/Icon';
import {
  Badge,
  Header,
  IconButton,
  IconRowSeparator,
  ListRow,
  SectionLabel,
  Segmented,
  formatQty,
} from '../../ui/primitives';
import StateView from '../../ui/StateView';
import { useUi } from '../../ui/theme';
import {
  clearRecentProducts,
  recentProducts,
  saveSearch,
  takeSavedSearch,
} from './recentProducts';
import type { RecentProduct } from './recentProducts';
import { ScanLayout, afterKeyboardHides, productCodes } from './shared';

/** Fewer characters match half the catalogue: wait for more. */
const MIN_QUERY = 2;

type Results = {
  query: string;
  filter: ProductSearchFilter;
  rows: ProductHit[];
  total: number;
};

/** The code or barcode is exactly what was typed or scanned. */
function isExact(p: ProductHit, text: string): boolean {
  const code = text.trim().toLowerCase();
  return p.code?.toLowerCase() === code || p.barcode?.toLowerCase() === code;
}

/** Exact reference/barcode matches first, the rest in Odoo's order. */
function exactFirst(rows: ProductHit[], text: string): ProductHit[] {
  return [
    ...rows.filter(p => isExact(p, text)),
    ...rows.filter(p => !isExact(p, text)),
  ];
}

/**
 * Find a product by name, reference or barcode (every word, any order), or
 * by scanning its label. Shows stock per result, an "In stock" filter, more
 * results while scrolling, and the products viewed recently.
 */
function ProductSearchScreen() {
  const { c, s, r, type } = useUi();
  const { nav } = useBarcode();
  const { message, show } = useScanMessages();
  // Back from a product opened here: the same search again.
  const [restored] = useState(takeSavedSearch);
  const [query, setQuery] = useState(restored?.query ?? '');
  const [filter, setFilter] = useState<ProductSearchFilter>(
    restored?.filter ?? 'all',
  );
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [recent, setRecent] = useState(recentProducts);
  const requestRef = useRef(0);
  /**
   * A scanned (or restored) search runs at once; the typing delay must not
   * run it again.
   */
  const scannedRef = useRef<string | null>(restored?.query.trim() ?? null);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const q = query.trim();
  const searching = q.length >= MIN_QUERY;

  const queryRef = useRef({ query, filter });
  queryRef.current = { query, filter };
  const open = useCallback(
    (p: RecentProduct) => {
      saveSearch(queryRef.current);
      afterKeyboardHides(() =>
        nav.push({ name: 'product', id: p.id, title: p.name }),
      );
    },
    [nav],
  );

  const search = useCallback(
    async (text: string, f: ProductSearchFilter, scanned?: string) => {
      const request = ++requestRef.current;
      setBusy(true);
      try {
        const page = await searchProductPage(text, f);
        if (request !== requestRef.current) {
          return;
        }
        const rows = exactFirst(page.rows, text);
        setResults({ query: text, filter: f, rows, total: page.total ?? 0 });
        setError(null);
        if (scanned) {
          const exact = rows.filter(p => isExact(p, scanned));
          if (exact.length === 1) {
            open(exact[0]);
          } else if (!rows.length) {
            show('danger', t('barcode.search.scanNone').replace('%s', scanned));
          }
        }
      } catch (e) {
        if (request !== requestRef.current) {
          return;
        }
        if (isSessionError(e)) {
          nav.signIn();
          return;
        }
        setError(e);
      } finally {
        if (request === requestRef.current) {
          setBusy(false);
        }
      }
    },
    [nav, open, show],
  );

  useEffect(() => {
    const text = restored?.query.trim() ?? '';
    if (restored && text.length >= MIN_QUERY) {
      search(text, restored.filter);
    }
  }, [restored, search]);

  // Typing: search once the user pauses.
  useEffect(() => {
    if (!searching) {
      ++requestRef.current;
      setBusy(false);
      setError(null);
      return;
    }
    if (scannedRef.current === q) {
      scannedRef.current = null;
      return;
    }
    const timer = setTimeout(() => search(q, filter), 300);
    return () => clearTimeout(timer);
  }, [q, filter, searching, search]);

  const onScan = (raw: string) => {
    const code = raw.trim();
    if (!code) {
      return;
    }
    // The same text again doesn't re-run the typing effect: nothing to skip.
    scannedRef.current = code === q ? null : code;
    setQuery(code);
    if (code.length >= MIN_QUERY) {
      search(code, filter, code);
    }
  };

  const loadMore = async () => {
    if (
      !results ||
      busy ||
      loadingMore ||
      results.rows.length >= results.total
    ) {
      return;
    }
    const request = requestRef.current;
    setLoadingMore(true);
    try {
      const page = await searchProductPage(
        results.query,
        results.filter,
        results.rows.length,
      );
      if (request === requestRef.current) {
        setResults(prev =>
          prev ? { ...prev, rows: [...prev.rows, ...page.rows] } : prev,
        );
      }
    } catch (e) {
      if (request === requestRef.current) {
        show('danger', errorText(e));
      }
    } finally {
      setLoadingMore(false);
    }
  };

  // Results of an older query or the other filter: dimmed until the new ones arrive.
  const stale =
    results !== null && (results.query !== q || results.filter !== filter);

  let body;
  let contentKey: string;
  if (!searching) {
    contentKey = recent.length ? 'recent' : 'hint';
    body = recent.length ? (
      <FlatList
        testID="product-recent"
        data={recent}
        keyExtractor={p => String(p.id)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: s.xxl }}
        ListHeaderComponent={
          <View style={styles.sectionRow}>
            <View style={styles.fill}>
              <SectionLabel label={t('barcode.search.recent')} />
            </View>
            <Pressable
              onPress={() => {
                clearRecentProducts();
                setRecent([]);
              }}
              accessibilityRole="button"
              hitSlop={8}
              style={[styles.sectionAction, { paddingHorizontal: s.lg }]}
              testID="product-recent-clear"
            >
              <Text style={[type.label, { color: c.accent }]}>
                {t('barcode.search.clearRecent')}
              </Text>
            </Pressable>
          </View>
        }
        ItemSeparatorComponent={IconRowSeparator}
        renderItem={({ item }) => (
          <ListRow
            testID={`product-recent-${item.id}`}
            title={item.name}
            subtitle={productCodes(item)}
            meta={item.category ?? undefined}
            icon="box"
            chevron
            onPress={() => open(item)}
          />
        )}
      />
    ) : (
      <StateView
        kind="empty"
        icon="search"
        title={t('barcode.search.hintTitle')}
        body={t('barcode.search.hintBody')}
      />
    );
  } else if (error && (!results || stale)) {
    contentKey = 'error';
    body = (
      <StateView
        kind={isOffline(error) ? 'offline' : 'error'}
        title={t('barcode.error.title')}
        body={errorText(error)}
        actionLabel={t('common.retry')}
        onAction={() => search(q, filter)}
      />
    );
  } else if (!results) {
    contentKey = 'loading';
    body = <StateView kind="loading" />;
  } else {
    contentKey = 'results';
    body = (
      <FlatList
        testID="product-results"
        style={stale ? styles.stale : undefined}
        data={results.rows}
        keyExtractor={p => String(p.id)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={[styles.grow, { paddingBottom: s.xxl }]}
        ListHeaderComponent={
          results.rows.length ? (
            <Text
              style={[
                type.caption,
                {
                  color: c.textMuted,
                  paddingHorizontal: s.lg,
                  paddingTop: s.md,
                  paddingBottom: s.sm,
                },
              ]}
              testID="product-results-count"
            >
              {results.total === 1
                ? t('barcode.search.countOne')
                : t('barcode.search.count').replace(
                    '%s',
                    String(results.total),
                  )}
            </Text>
          ) : undefined
        }
        ItemSeparatorComponent={IconRowSeparator}
        ListEmptyComponent={
          <StateView
            kind="empty"
            icon="search"
            title={t('barcode.search.noneFor').replace('%s', results.query)}
            body={
              results.filter === 'inStock'
                ? t('barcode.search.noneInStock')
                : t('barcode.search.noneBody')
            }
            actionLabel={
              results.filter === 'inStock'
                ? t('barcode.search.showAll')
                : undefined
            }
            onAction={() => setFilter('all')}
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={c.accent} style={{ margin: s.lg }} />
          ) : undefined
        }
        renderItem={({ item }) => (
          <ProductHitRow
            item={item}
            exact={isExact(item, results.query)}
            onPress={() => open(item)}
          />
        )}
      />
    );
  }

  return (
    <ScanLayout
      testID="barcode-search"
      contentKey={contentKey}
      header={
        <Header title={t('barcode.search.title')} onBack={nav.pop}>
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: c.surfaceAlt,
                borderRadius: r.md,
                marginHorizontal: s.lg,
                marginTop: s.xs,
                paddingLeft: s.md,
              },
            ]}
          >
            <Icon name="search" color={c.textMuted} size={20} />
            <TextInput
              ref={inputRef}
              testID="product-search-input"
              value={query}
              onChangeText={setQuery}
              autoFocus={!restored}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => searching && search(q, filter)}
              placeholder={t('barcode.search.placeholder')}
              placeholderTextColor={c.textFaint}
              style={[
                type.body,
                styles.fill,
                styles.searchInput,
                { color: c.text, marginLeft: s.sm },
              ]}
            />
            {busy ? (
              <ActivityIndicator
                color={c.textMuted}
                style={{ marginHorizontal: s.md }}
                testID="product-search-busy"
              />
            ) : query ? (
              <IconButton
                icon="close"
                label={t('barcode.search.clear')}
                color={c.textMuted}
                onPress={() => {
                  setQuery('');
                  setRecent(recentProducts());
                  inputRef.current?.focus();
                }}
                testID="product-search-clear"
              />
            ) : null}
          </View>
          <Segmented<ProductSearchFilter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('barcode.search.all') },
              { value: 'inStock', label: t('barcode.search.inStock') },
            ]}
          />
        </Header>
      }
      onCode={onScan}
      message={message}
    >
      {body}
    </ScanLayout>
  );
}

/** Name, codes and category, with the stock on hand on the right. */
function ProductHitRow({
  item,
  exact,
  onPress,
}: {
  item: ProductHit;
  exact: boolean;
  onPress: () => void;
}) {
  let stock = null;
  if (item.isStorable) {
    const reservedAll = item.onHand > 0 && item.free <= 0;
    stock = (
      <Badge
        label={
          item.onHand === 0
            ? t('barcode.search.outOfStock')
            : reservedAll
            ? t('barcode.search.allReserved')
            : t('barcode.product.onHand').replace('%s', formatQty(item.onHand))
        }
        tone={
          item.onHand < 0
            ? 'danger'
            : item.onHand === 0
            ? 'neutral'
            : reservedAll
            ? 'warning'
            : 'success'
        }
      />
    );
  }
  return (
    <ListRow
      testID={`product-hit-${item.id}`}
      title={item.name}
      subtitle={productCodes(item)}
      meta={item.category ?? undefined}
      icon={exact ? 'check' : 'box'}
      iconTone={exact ? 'success' : 'neutral'}
      trailing={stock}
      chevron
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  stale: { opacity: 0.45 },
  searchBox: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  searchInput: { height: 52 },
  sectionRow: { flexDirection: 'row', alignItems: 'flex-end' },
  sectionAction: {
    minHeight: 48,
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
});

export default ProductSearchScreen;
