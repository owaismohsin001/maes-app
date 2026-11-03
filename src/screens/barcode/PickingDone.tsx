import React, { ReactNode, useEffect } from 'react';
import {
  AccessibilityInfo,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../../i18n';
import type { ProductRow } from '../../barcode/picking';
import Icon from '../../ui/Icon';
import { FadeIn, SuccessMark } from '../../ui/motion';
import {
  Button,
  Card,
  IconRowSeparator,
  ListRow,
  StatRow,
} from '../../ui/primitives';
import { useUi } from '../../ui/theme';

type Props = {
  /** Operation type code: incoming, outgoing or internal. */
  code: string;
  name: string;
  partner: string | null;
  rows: ProductRow[];
  /** From › › › › To of the transfer, as on its own screen. */
  route: ReactNode;
  backorders: { id: number; name: string }[];
  onOpenBackorder: (id: number) => void;
  onBack: () => void;
};

/** Steps between the parts of the screen appearing, after the check. */
const STAGGER_MS = 90;
const FIRST_MS = 260;

/**
 * Shown once a transfer is validated: the moment itself (animated check),
 * what was done, where the goods went, and any backorder left to do.
 */
function PickingDone({
  code,
  name,
  partner,
  rows,
  route,
  backorders,
  onOpenBackorder,
  onBack,
}: Props) {
  const { c, s, r, type } = useUi();
  const title = t(
    code === 'incoming'
      ? 'barcode.done.incoming'
      : code === 'outgoing'
      ? 'barcode.done.outgoing'
      : 'barcode.picking.validated',
  );

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(title);
  }, [title]);

  const doneRows = rows.filter(row => row.done > 0);
  const units = doneRows.reduce((sum, row) => sum + row.done, 0);
  const delay = (step: number) => FIRST_MS + step * STAGGER_MS;

  return (
    <View style={styles.fill}>
      <ScrollView
        contentContainerStyle={{ padding: s.lg, paddingBottom: s.xl }}
      >
        <View style={styles.hero}>
          <SuccessMark
            testID="picking-done-mark"
            size={72}
            color={c.success}
            soft={c.successSoft}
            onColor={c.surface}
          />
          <FadeIn delay={delay(0)} rise={10}>
            <Text
              style={[type.display, styles.center, { color: c.text }]}
              accessibilityRole="header"
            >
              {title}
            </Text>
            <Text
              style={[
                type.body,
                styles.center,
                { color: c.textMuted, marginTop: s.xs },
              ]}
              numberOfLines={2}
            >
              {partner ? `${name} · ${partner}` : name}
            </Text>
          </FadeIn>
        </View>

        <FadeIn delay={delay(1)} style={{ marginTop: s.xl }}>
          <StatRow
            stats={[
              { label: t('barcode.done.products'), value: doneRows.length },
              { label: t('barcode.done.units'), value: units, tone: 'success' },
            ]}
          />
        </FadeIn>

        <FadeIn delay={delay(2)} style={{ marginTop: s.md }}>
          <Card>{route}</Card>
        </FadeIn>

        {backorders.length ? (
          <FadeIn
            delay={delay(3)}
            style={{ marginTop: s.md }}
            testID="picking-done-backorders"
          >
            <Card>
              <View
                style={[
                  styles.row,
                  { paddingHorizontal: s.lg, paddingTop: s.lg },
                ]}
              >
                <View
                  style={[
                    styles.badgeIcon,
                    { backgroundColor: c.warningSoft, borderRadius: r.md },
                  ]}
                >
                  <Icon name="warning" color={c.warning} size={20} />
                </View>
                <View style={[styles.fill, { marginLeft: s.md }]}>
                  <Text
                    style={[type.heading, { color: c.text }]}
                    accessibilityRole="header"
                  >
                    {t('barcode.done.backorderTitle')}
                  </Text>
                  <Text style={[type.body, { color: c.textMuted }]}>
                    {t('barcode.picking.backorderCreated')}
                  </Text>
                </View>
              </View>
              <View style={{ paddingTop: s.sm }}>
                {backorders.map((b, i) => (
                  <React.Fragment key={b.id}>
                    {i ? <IconRowSeparator /> : null}
                    <ListRow
                      testID={`picking-done-backorder-${b.id}`}
                      title={b.name}
                      icon="transfer"
                      iconTone="warning"
                      chevron
                      onPress={() => onOpenBackorder(b.id)}
                    />
                  </React.Fragment>
                ))}
              </View>
            </Card>
          </FadeIn>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            padding: s.lg,
            backgroundColor: c.surface,
            borderTopColor: c.border,
          },
        ]}
      >
        <Button
          label={t('barcode.picking.backToList')}
          icon="back"
          onPress={onBack}
          testID="picking-done-back"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hero: { alignItems: 'center' },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  badgeIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});

export default PickingDone;
