import React, { useEffect, useRef } from 'react';
import { FlatList, RefreshControl, Text, View, StyleSheet } from 'react-native';
import { getProductDetails, productStock } from '../../api/barcode';
import type { ProductDetails, StockLine } from '../../api/barcode';
import { odooRecordPath } from '../../api/odoo';
import { useLiveSync } from '../../hooks/useLiveSync';
import { useOdooQuery } from '../../hooks/useOdooQuery';
import { t } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import {
  errorText,
  isOffline,
  useBarcode,
} from '../../navigation/barcodeContext';
import {
  Badge,
  Card,
  CardSegment,
  DetailCard,
  DetailRow,
  Header,
  ListRow,
  formatQty,
  IconRowSeparator,
} from '../../ui/primitives';
import StateView from '../../ui/StateView';
import { useUi } from '../../ui/theme';
import { formatMoney } from '../../utils/format';
import { rememberProduct } from './recentProducts';
import { ScanLayout, useMainScan } from './shared';

type Props = { productId: number; title: string };

type ProductInfo = { product: ProductDetails | null; stock: StockLine[] };

function trackingKey(p: ProductDetails): TranslationKey {
  if (!p.isStorable) {
    return 'barcode.product.tracking.off';
  }
  return `barcode.product.tracking.${p.tracking}`;
}

/** Name and codes of the product that was scanned or searched, stock at a glance. */
function ProductHero({ product }: { product: ProductDetails }) {
  const { c, s, type } = useUi();
  const reserved = Math.max(0, product.onHand - product.free);
  return (
    <Card style={{ padding: s.lg }}>
      <Text
        style={[type.title, styles.center, { color: c.text }]}
        accessibilityRole="header"
        testID="product-name"
      >
        {product.name}
      </Text>
      <View
        style={[
          styles.codeRow,
          { columnGap: s.xxl, rowGap: s.sm, marginTop: s.sm },
        ]}
      >
        <Text
          style={[type.mono, { color: c.accent }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {product.code ?? t('barcode.product.noCode')}
        </Text>
        <Badge
          label={t('barcode.product.onHand').replace(
            '%s',
            formatQty(product.onHand),
          )}
          tone={product.onHand > 0 ? 'success' : 'neutral'}
        />
        {reserved ? (
          <Badge
            label={t('barcode.product.reserved').replace(
              '%s',
              formatQty(reserved),
            )}
            tone="info"
          />
        ) : null}
        {product.tracking !== 'none' ? (
          <Badge
            label={t(
              product.tracking === 'serial'
                ? 'barcode.product.serial'
                : 'barcode.product.lot',
            )}
            tone="neutral"
          />
        ) : null}
      </View>
    </Card>
  );
}

function ProductInfoCard({ product }: { product: ProductDetails }) {
  const notSet = t('barcode.product.notSet');
  return (
    <DetailCard title={t('barcode.product.info')} testID="product-info">
      <DetailRow
        half
        icon="layers"
        label={t('barcode.product.category')}
        value={product.category ?? notSet}
      />
      <DetailRow
        half
        icon="barcode"
        label={t('barcode.product.barcode')}
        value={product.barcode ?? t('barcode.product.noBarcode')}
        tone={product.barcode ? undefined : 'warning'}
      />
      <DetailRow
        half
        icon="box"
        label={t('barcode.product.type')}
        value={t(`barcode.product.type.${product.type}`)}
      />
      <DetailRow
        half
        icon="hash"
        label={t('barcode.product.tracking')}
        value={t(trackingKey(product))}
      />
      <DetailRow
        half
        icon="ruler"
        label={t('barcode.product.uom')}
        value={product.uom ?? notSet}
      />
      <DetailRow
        half
        mono
        icon="banknote"
        label={t('barcode.product.price')}
        value={formatMoney(product.salePrice, product.currency)}
      />
    </DetailCard>
  );
}

function StockCard({ product }: { product: ProductDetails }) {
  const qty = (n: number) =>
    product.uom ? `${formatQty(n)} ${product.uom}` : formatQty(n);
  return (
    <DetailCard title={t('barcode.product.stock')} testID="product-qty">
      <DetailRow
        half
        mono
        icon="box"
        label={t('barcode.product.qty.onHand')}
        value={qty(product.onHand)}
      />
      <DetailRow
        half
        mono
        icon="success"
        label={t('barcode.product.qty.free')}
        value={qty(product.free)}
      />
      <DetailRow
        half
        mono
        icon="lock"
        label={t('barcode.product.qty.reserved')}
        value={qty(Math.max(0, product.onHand - product.free))}
      />
      <DetailRow
        half
        mono
        icon="activity"
        label={t('barcode.product.qty.forecast')}
        value={qty(product.forecast)}
        tone={product.forecast < 0 ? 'danger' : undefined}
      />
      <DetailRow
        half
        mono
        icon="receipt"
        label={t('barcode.product.qty.incoming')}
        value={qty(product.incoming)}
      />
      <DetailRow
        half
        mono
        icon="delivery"
        label={t('barcode.product.qty.outgoing')}
        value={qty(product.outgoing)}
      />
    </DetailCard>
  );
}

/** Everything about one product (main-menu product scan or search). */
function ProductScreen({ productId, title }: Props) {
  const { c, s, type } = useUi();
  const { nav } = useBarcode();
  const scan = useMainScan();
  const load = async (): Promise<ProductInfo> => {
    const [product, stock] = await Promise.all([
      getProductDetails(productId),
      productStock(productId),
    ]);
    return { product, stock };
  };
  const info = useOdooQuery<ProductInfo>(load, String(productId));

  // Live sync: stock moved in Odoo while the product is open shows up here.
  // Read-only, so the check simply loads the (small) product data again.
  const latest = useRef<ProductInfo | null>(null);
  const { rebase } = useLiveSync({
    enabled: !!info.data?.product,
    intervalMs: 30000,
    idleIntervalMs: 60000,
    stamp: async () => {
      latest.current = await load();
      return JSON.stringify(latest.current);
    },
    onChange: async () => {
      if (latest.current) {
        info.setData(latest.current);
        scan.show('info', t('barcode.sync.productUpdated'));
      }
      return true;
    },
  });
  useEffect(() => {
    if (info.data) {
      rebase(JSON.stringify(info.data));
    }
  }, [info.data, rebase]);

  const product = info.data?.product ?? null;
  const stock = info.data?.stock ?? [];
  // Listed under "Recently viewed" on the Find-a-product screen.
  useEffect(() => {
    if (product) {
      rememberProduct(product);
    }
  }, [product]);

  let body;
  if (!info.data) {
    body = info.error ? (
      <StateView
        kind={isOffline(info.error) ? 'offline' : 'error'}
        title={t('barcode.error.title')}
        body={errorText(info.error)}
        actionLabel={t('common.retry')}
        onAction={info.reload}
      />
    ) : (
      <StateView kind="loading" />
    );
  } else if (!product) {
    body = (
      <StateView
        kind="empty"
        title={t('barcode.product.unknown')}
        actionLabel={t('common.retry')}
        onAction={info.reload}
      />
    );
  } else {
    body = (
      <FlatList
        testID="product-stock"
        data={stock}
        keyExtractor={l => String(l.id)}
        refreshControl={
          <RefreshControl
            refreshing={info.loading}
            onRefresh={info.reload}
            colors={[c.accent]}
          />
        }
        contentContainerStyle={{ paddingTop: s.lg, paddingBottom: s.xxl }}
        ListHeaderComponent={
          <>
            <View style={{ paddingHorizontal: s.lg }}>
              <ProductHero product={product} />
              <ProductInfoCard product={product} />
              <StockCard product={product} />
            </View>
            <CardSegment
              edge="top"
              style={{ marginTop: s.md, padding: s.lg, paddingBottom: s.sm }}
            >
              <Text
                style={[type.heading, { color: c.text }]}
                accessibilityRole="header"
              >
                {t('barcode.product.locations')}
              </Text>
            </CardSegment>
          </>
        }
        ItemSeparatorComponent={LocationSeparator}
        ListEmptyComponent={
          <CardSegment style={{ paddingHorizontal: s.lg, paddingBottom: s.sm }}>
            <Text style={[type.body, { color: c.textMuted }]}>
              {t('barcode.product.noStock')}
            </Text>
          </CardSegment>
        }
        ListFooterComponent={
          <CardSegment edge="bottom" style={{ height: s.sm }} />
        }
        renderItem={({ item }) => (
          <CardSegment>
            <ListRow
              title={item.location}
              subtitle={item.lot ?? undefined}
              icon="location"
              trailing={formatQty(item.quantity)}
            />
          </CardSegment>
        )}
      />
    );
  }

  return (
    <ScanLayout
      testID="barcode-product"
      contentKey={
        product
          ? 'data'
          : info.data
          ? 'empty'
          : info.error
          ? 'error'
          : 'loading'
      }
      header={
        <Header
          title={t('barcode.product.title')}
          subtitle={product?.name ?? title}
          onBack={nav.pop}
          actions={[
            {
              icon: 'external',
              label: t('barcode.odoo.open'),
              onPress: () =>
                nav.openOdoo(odooRecordPath('product.product', productId)),
            },
          ]}
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

function LocationSeparator() {
  return (
    <CardSegment>
      <IconRowSeparator />
    </CardSegment>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  /** Reference and stock badges on one line under the name, centred. */
  codeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ProductScreen;
