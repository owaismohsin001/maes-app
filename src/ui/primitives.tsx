import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import Icon, { IconName } from './Icon';
import { PressScale, isReduceMotion } from './motion';
import { Tone, Ui, radius, spacing, toneColors, useUi } from './theme';

// -----------------------------------------------------------------------------
// Screen
// -----------------------------------------------------------------------------

type ScreenProps = {
  children: ReactNode;
  /** Pad the bottom inset here (false when a bottom bar does it). */
  padBottom?: boolean;
  testID?: string;
};

/** Root of every native screen: background, top inset, status bar icons. */
export function Screen({ children, padBottom = true, testID }: ScreenProps) {
  const { c, dark } = useUi();
  const insets = useSafeAreaInsets();
  const paddingBottom = padBottom ? insets.bottom : 0;
  return (
    <View
      testID={testID}
      style={[
        styles.fill,
        { backgroundColor: c.bg, paddingTop: insets.top, paddingBottom },
      ]}
    >
      <StatusBar animated barStyle={dark ? 'light-content' : 'dark-content'} />
      {children}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

export type HeaderAction = {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
};

/**
 * Actions a layout adds to the Header of the screen inside it, before the
 * screen's own (ScanLayout: manual code entry).
 */
export const HeaderLayoutActions = createContext<HeaderAction[]>([]);

type HeaderProps = {
  title: string;
  subtitle?: string;
  /** Icon before the title. */
  titleIcon?: IconName;
  /** Title in the middle of the bar instead of next to the back button. */
  center?: boolean;
  onBack?: () => void;
  actions?: HeaderAction[];
  /** Optional element under the title row (e.g. a progress bar). */
  children?: ReactNode;
};

export function Header({
  title,
  subtitle,
  titleIcon,
  center = false,
  onBack,
  actions = [],
  children,
}: HeaderProps) {
  const ui = useUi();
  const st = useMemo(() => headerStyles(ui), [ui]);
  const layoutActions = useContext(HeaderLayoutActions);
  const shown = [...layoutActions, ...actions].slice(0, 2);
  // A centred title keeps clear of the icon buttons on the busier side.
  const buttons = Math.max(onBack ? 1 : 0, shown.length);
  const inset = ui.s.xs + buttons * ICON_BUTTON;
  return (
    <View style={st.wrap}>
      <View style={st.row}>
        {onBack ? (
          <IconButton
            icon="back"
            label={t('common.back')}
            onPress={onBack}
            testID="header-back"
          />
        ) : (
          <View style={st.spacer} />
        )}
        {center ? <View style={st.titles} /> : null}
        <View
          style={
            center
              ? [st.titlesCenter, { left: inset, right: inset }]
              : st.titles
          }
          pointerEvents={center ? 'none' : 'auto'}
        >
          <View style={st.titleRow}>
            {titleIcon ? (
              <View style={st.titleIcon}>
                <Icon name={titleIcon} color={ui.c.accent} size={22} />
              </View>
            ) : null}
            <Text style={st.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          </View>
          {subtitle ? (
            <Text style={st.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {shown.map(a => (
          <IconButton
            key={a.label}
            icon={a.icon}
            label={a.label}
            onPress={a.onPress}
            testID={a.testID}
          />
        ))}
      </View>
      {children}
    </View>
  );
}

const headerStyles = ({ c, s, type }: Ui) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: s.xs,
    },
    spacer: { width: s.md },
    titles: { flex: 1, paddingHorizontal: s.xs },
    // Over the whole row; `left`/`right` keep it clear of the icon buttons.
    titlesCenter: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleRow: { flexDirection: 'row', alignItems: 'center' },
    titleIcon: { marginRight: s.sm },
    title: { ...type.heading, color: c.text },
    subtitle: { ...type.caption, color: c.textMuted, marginTop: 1 },
  });

// -----------------------------------------------------------------------------
// IconButton
// -----------------------------------------------------------------------------

/** Size of an icon button: the 48dp tap target. */
const ICON_BUTTON = 48;

type IconButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  testID?: string;
};

export function IconButton({
  icon,
  label,
  onPress,
  color,
  testID,
}: IconButtonProps) {
  const { c, r } = useUi();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        { borderRadius: r.pill },
        pressed && { backgroundColor: c.surfaceAlt },
      ]}
    >
      <Icon name={icon} color={color ?? c.text} size={22} />
    </Pressable>
  );
}

// -----------------------------------------------------------------------------
// Button
// -----------------------------------------------------------------------------

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'success';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading = false,
  disabled = false,
  style,
  testID,
}: ButtonProps) {
  const { c, r, s, type } = useUi();
  const palette = {
    primary: { bg: c.brand, fg: c.onBrand, border: c.brand },
    secondary: { bg: c.surface, fg: c.text, border: c.border },
    ghost: { bg: 'transparent', fg: c.text, border: 'transparent' },
    danger: { bg: c.danger, fg: '#FFFFFF', border: c.danger },
    success: { bg: c.success, fg: c.onSuccess, border: c.success },
  }[variant];
  const inactive = disabled || loading;
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      pressStyle={pressed => [
        styles.button,
        {
          minHeight: size === 'lg' ? 56 : 48,
          borderRadius: r.md,
          paddingHorizontal: s.lg,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? (
            <View style={{ marginRight: s.sm }}>
              <Icon name={icon} color={palette.fg} size={20} />
            </View>
          ) : null}
          <Text
            style={[type.bodyStrong, { color: palette.fg }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </>
      )}
    </PressScale>
  );
}

// -----------------------------------------------------------------------------
// Card
// -----------------------------------------------------------------------------

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, r } = useUi();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
          borderRadius: r.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Badge
// -----------------------------------------------------------------------------

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: Tone;
}) {
  const { c, r, s, type } = useUi();
  const { fg, bg } = toneColors(c, tone);
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg, borderRadius: r.pill, paddingHorizontal: s.sm },
      ]}
    >
      <Text style={[type.caption, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// -----------------------------------------------------------------------------
// ListRow
// -----------------------------------------------------------------------------

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Third line, muted (e.g. a location). */
  meta?: string;
  icon?: IconName;
  iconTone?: Tone;
  /** Right side: a value (e.g. a count) or any element. */
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  /** Briefly highlights the row (e.g. after a scan hit it). */
  flashKey?: number;
  selected?: boolean;
  testID?: string;
};

export function ListRow({
  title,
  subtitle,
  meta,
  icon,
  iconTone = 'neutral',
  trailing,
  chevron = false,
  onPress,
  flashKey,
  selected = false,
  testID,
}: ListRowProps) {
  const ui = useUi();
  const { c, s, r, type } = ui;
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!flashKey) {
      return;
    }
    flash.setValue(1);
    const anim = Animated.timing(flash, {
      toValue: 0,
      duration: 900,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [flashKey, flash]);
  const tone = toneColors(c, iconTone);
  const marker = selected ? c.accent : c.surface;
  const content = (
    <Animated.View
      style={[
        styles.row,
        {
          paddingHorizontal: s.lg,
          paddingVertical: s.md,
          backgroundColor: flash.interpolate({
            inputRange: [0, 1],
            outputRange: [c.surface, c.accentSoft],
          }),
          borderLeftColor: marker,
        },
      ]}
    >
      {icon ? (
        <View
          style={[
            styles.rowIcon,
            { backgroundColor: tone.bg, borderRadius: r.md, marginRight: s.md },
          ]}
        >
          <Icon name={icon} color={tone.fg} size={20} />
        </View>
      ) : null}
      <View style={styles.fill}>
        <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[type.caption, styles.rowLine, { color: c.textMuted }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text
            style={[type.caption, styles.rowLine, { color: c.textFaint }]}
            numberOfLines={1}
          >
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing != null ? (
        <View style={{ marginLeft: s.sm }}>
          {typeof trailing === 'string' || typeof trailing === 'number' ? (
            <Text style={[type.mono, { color: c.text }]}>{trailing}</Text>
          ) : (
            trailing
          )}
        </View>
      ) : null}
      {chevron ? (
        <View style={{ marginLeft: s.xs }}>
          <Icon name="chevron" color={c.textFaint} size={20} />
        </View>
      ) : null}
    </Animated.View>
  );
  if (!onPress) {
    return <View testID={testID}>{content}</View>;
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      {content}
    </Pressable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { c } = useUi();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: c.border,
        marginLeft: inset,
      }}
    />
  );
}

/** List separators, as components (FlatList's ItemSeparatorComponent). */
export function RowSeparator() {
  return <Divider inset={spacing.lg} />;
}

/** Separator for rows with a leading icon: starts under the text. */
export function IconRowSeparator() {
  return <Divider inset={spacing.lg + 52} />;
}

export function SectionLabel({ label }: { label: string }) {
  const { c, s, type } = useUi();
  return (
    <Text
      style={[
        type.label,
        {
          color: c.textMuted,
          paddingHorizontal: s.lg,
          paddingTop: s.xl,
          paddingBottom: s.sm,
        },
      ]}
      accessibilityRole="header"
    >
      {label}
    </Text>
  );
}

// -----------------------------------------------------------------------------
// Tile / TileGrid (home-screen shortcuts, two per line)
// -----------------------------------------------------------------------------

type TileProps = {
  icon: IconName;
  label: string;
  /** Small count in the corner (e.g. transfers ready). Hidden when 0. */
  count?: number;
  countTone?: Tone;
  onPress: () => void;
  testID?: string;
};

export function Tile({
  icon,
  label,
  count,
  countTone = 'accent',
  onPress,
  testID,
}: TileProps) {
  const { c, s, r, type } = useUi();
  const badge = toneColors(c, countTone);
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count}` : label}
      to={0.96}
      pressStyle={pressed => [
        styles.tile,
        {
          backgroundColor: pressed ? c.surfaceAlt : c.surface,
          borderColor: c.border,
          borderRadius: r.lg,
          padding: s.lg,
        },
      ]}
    >
      <View
        style={[
          styles.tileIcon,
          { backgroundColor: c.accentSoft, borderRadius: r.lg },
        ]}
      >
        <Icon name={icon} color={c.accent} size={30} />
      </View>
      <Text
        style={[
          type.label,
          styles.tileLabel,
          { color: c.text, marginTop: s.md },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {count ? (
        <View
          style={[
            styles.tileCount,
            {
              backgroundColor: badge.fg,
              borderRadius: r.pill,
              top: s.sm,
              right: s.sm,
            },
          ]}
        >
          <Text style={[type.caption, { color: c.surface }]}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </PressScale>
  );
}

/** Lays tiles out two per line, equal width; an odd last tile keeps its width. */
export function TileGrid({ children }: { children: ReactNode }) {
  const { s } = useUi();
  const items = React.Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }
  return (
    <View style={{ gap: s.md }}>
      {rows.map((row, i) => (
        // Each tile in an equal cell: a tile next to an empty spacer would get
        // its padding on top of its flex share and come out wider.
        <View key={i} style={[styles.tileRow, { gap: s.md }]}>
          {row.map((tile, j) => (
            <View key={j} style={styles.tileCell}>
              {tile}
            </View>
          ))}
          {row.length === 1 ? <View style={styles.tileCell} /> : null}
        </View>
      ))}
    </View>
  );
}

// -----------------------------------------------------------------------------
// StatRow (a few headline numbers side by side)
// -----------------------------------------------------------------------------

export type Stat = { label: string; value: number; tone?: Tone };

export function StatRow({ stats }: { stats: Stat[] }) {
  const { c, s, r, type } = useUi();
  return (
    <View style={[styles.tileRow, { gap: s.sm }]}>
      {stats.map(stat => {
        const color =
          stat.tone && stat.value ? toneColors(c, stat.tone).fg : c.text;
        return (
          <View
            key={stat.label}
            accessible
            accessibilityLabel={`${stat.label}: ${stat.value}`}
            style={[
              styles.stat,
              {
                backgroundColor: c.surface,
                borderColor: c.border,
                borderRadius: r.md,
                paddingVertical: s.md,
              },
            ]}
          >
            <Text style={[type.title, styles.tabular, { color }]}>
              {stat.value}
            </Text>
            <Text
              style={[type.caption, { color: c.textMuted }]}
              numberOfLines={1}
            >
              {stat.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// -----------------------------------------------------------------------------
// SplitBar / OverviewCard (a total, how it splits up, and what needs attention)
// -----------------------------------------------------------------------------

export type Share = { label: string; value: number; tone: Tone };

/** One bar split by share (e.g. ready vs waiting); grey when all are 0. */
export function SplitBar({ shares }: { shares: Share[] }) {
  const { c, r } = useUi();
  const parts = shares.filter(share => share.value > 0);
  return (
    <View
      style={[
        styles.split,
        { borderRadius: r.pill, backgroundColor: c.surfaceAlt },
      ]}
      accessible={false}
    >
      {parts.map(share => (
        <View
          key={share.label}
          style={{
            flex: share.value,
            backgroundColor: toneColors(c, share.tone).fg,
          }}
        />
      ))}
    </View>
  );
}

export type OverviewCardProps = {
  icon: IconName;
  /** Small label above the total ("Open deliveries"). */
  label: string;
  total: number;
  shares: Share[];
  /** A line at the foot: what needs attention, or that all is well. */
  status: { tone: Tone; icon: IconName; title: string; body?: string };
  testID?: string;
};

/**
 * The head of an overview: a big total, a bar of how it splits up with a
 * legend under it, and a tinted status line.
 */
export function OverviewCard({
  icon,
  label,
  total,
  shares,
  status,
  testID,
}: OverviewCardProps) {
  const { c, s, r, type } = useUi();
  const tone = toneColors(c, status.tone);
  return (
    <Card>
      <View
        testID={testID}
        style={{ padding: s.lg, gap: s.md }}
        accessible
        accessibilityLabel={[
          `${label}: ${total}`,
          ...shares.map(share => `${share.label}: ${share.value}`),
        ].join(', ')}
      >
        <View style={styles.overviewHead}>
          <View
            style={[
              styles.overviewIcon,
              { backgroundColor: c.accentSoft, borderRadius: r.md },
            ]}
          >
            <Icon name={icon} color={c.accent} size={26} />
          </View>
          <View style={[styles.fill, { marginLeft: s.md }]}>
            <Text
              style={[type.label, { color: c.textMuted }]}
              numberOfLines={1}
            >
              {label}
            </Text>
            <Text style={[type.display, styles.tabular, { color: c.text }]}>
              {total}
            </Text>
          </View>
        </View>
        <SplitBar shares={shares} />
        <View style={[styles.legend, { columnGap: s.lg, rowGap: s.xs }]}>
          {shares.map(share => (
            <View key={share.label} style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  {
                    backgroundColor: toneColors(c, share.tone).fg,
                    borderRadius: r.pill,
                    marginRight: s.xs + 2,
                  },
                ]}
              />
              <Text style={[type.caption, { color: c.textMuted }]}>
                {share.label}
              </Text>
              <Text
                style={[
                  type.label,
                  styles.tabular,
                  { color: c.text, marginLeft: s.xs },
                ]}
              >
                {share.value}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View
        style={[
          styles.overviewStatus,
          {
            backgroundColor: tone.bg,
            paddingHorizontal: s.lg,
            paddingVertical: s.md,
          },
        ]}
        accessible
        accessibilityLabel={[status.title, status.body]
          .filter(Boolean)
          .join('. ')}
      >
        <Icon name={status.icon} color={tone.fg} size={20} />
        <View style={[styles.fill, { marginLeft: s.sm }]}>
          <Text style={[type.bodyStrong, { color: tone.fg }]}>
            {status.title}
          </Text>
          {status.body ? (
            <Text style={[type.caption, { color: c.textMuted }]}>
              {status.body}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// DetailCard / DetailRow (read-only "label: value" facts, grouped by topic)
// -----------------------------------------------------------------------------

export function DetailCard({
  title,
  children,
  flush = false,
  testID,
}: {
  title: string;
  children: ReactNode;
  /** No top margin: inside a stack that spaces its items itself. */
  flush?: boolean;
  testID?: string;
}) {
  const { c, s, type } = useUi();
  return (
    <View testID={testID} style={!flush && { marginTop: s.md }}>
      <Card style={{ padding: s.lg }}>
        <Text
          style={[type.heading, { color: c.text, marginBottom: s.xs }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        <View style={styles.detailGrid}>{children}</View>
      </Card>
    </View>
  );
}

type DetailRowProps = {
  icon: IconName;
  label: string;
  value: string;
  /** Codes and quantities: tabular figures, one line. */
  mono?: boolean;
  /** Value colour for a status (e.g. warning when a barcode is missing). */
  tone?: Tone;
  /** Two per line inside a DetailCard (short values such as quantities). */
  half?: boolean;
  /** Show the whole value, however long (diagnostics read from a screenshot). */
  wrap?: boolean;
  /** Tappable (call, e-mail): the value shows in the accent colour. */
  onPress?: () => void;
  testID?: string;
};

export function DetailRow({
  icon,
  label,
  value,
  mono = false,
  tone,
  half = false,
  wrap = false,
  onPress,
  testID,
}: DetailRowProps) {
  const { c, s, type } = useUi();
  const color = tone ? toneColors(c, tone).fg : onPress ? c.accent : c.text;
  return (
    <Pressable
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      accessible
      accessibilityRole={onPress ? 'link' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [
        styles.detailRow,
        half ? styles.half : styles.full,
        { paddingTop: s.md, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={[styles.detailIcon, { marginRight: s.md }]}>
        <Icon name={icon} color={c.accent} size={20} />
      </View>
      <View style={styles.fill}>
        <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[
            mono ? type.mono : type.bodyStrong,
            styles.rowLine,
            { color },
          ]}
          numberOfLines={wrap ? undefined : mono ? 1 : 3}
          ellipsizeMode={mono ? 'middle' : 'tail'}
        >
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * One slice of a card that a FlatList builds from its header, rows and
 * footer: `top` opens it (rounded, top border), `bottom` closes it.
 */
export function CardSegment({
  edge,
  children,
  style,
}: {
  /** `both`: a card of one slice. */
  edge?: 'top' | 'bottom' | 'both';
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, s } = useUi();
  const top = edge === 'top' || edge === 'both';
  const bottom = edge === 'bottom' || edge === 'both';
  return (
    <View
      style={[
        styles.cardSegment,
        top && styles.segmentTop,
        bottom && styles.segmentBottom,
        {
          marginHorizontal: s.lg,
          backgroundColor: c.surface,
          borderColor: c.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// -----------------------------------------------------------------------------
// ProgressBar
// -----------------------------------------------------------------------------

export function ProgressBar({
  value,
  total,
  tone,
}: {
  value: number;
  total: number;
  tone?: Tone;
}) {
  const { c, r } = useUi();
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  const done = total > 0 && value >= total;
  const fg = toneColors(c, tone ?? (done ? 'success' : 'accent')).fg;
  return (
    <View
      style={[
        styles.progress,
        { borderRadius: r.pill, backgroundColor: c.surfaceAlt },
      ]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: value }}
    >
      <View
        style={[
          styles.progressFill,
          { width: `${ratio * 100}%`, backgroundColor: fg },
        ]}
      />
    </View>
  );
}

// -----------------------------------------------------------------------------
// Stepper
// -----------------------------------------------------------------------------

type StepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  testID?: string;
};

export function Stepper({ value, onChange, min = 0, testID }: StepperProps) {
  const { c, r, s, type } = useUi();
  const button = (
    icon: IconName,
    label: string,
    next: number,
    off: boolean,
  ) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.stepButton,
        {
          borderRadius: r.md,
          backgroundColor: pressed ? c.border : c.surfaceAlt,
          opacity: off ? 0.4 : 1,
        },
      ]}
    >
      <Icon name={icon} color={c.text} size={22} />
    </Pressable>
  );
  return (
    <View style={styles.stepper} testID={testID}>
      {button(
        'minus',
        t('ui.decrease'),
        Math.max(min, value - 1),
        value <= min,
      )}
      <Text
        style={[
          type.title,
          styles.stepValue,
          { color: c.text, marginHorizontal: s.sm },
        ]}
        testID={testID ? `${testID}-value` : undefined}
      >
        {formatQty(value)}
      </Text>
      {button('plus', t('ui.increase'), value + 1, false)}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Segmented
// -----------------------------------------------------------------------------

const SEGMENTED_PAD = 3;

type SegmentedProps<V extends string> = {
  value: V;
  /** `count`: small number after the label (e.g. work waiting there). Hidden when 0. */
  options: { value: V; label: string; count?: number; countTone?: Tone }[];
  onChange: (value: V) => void;
};

/** Two or three mutually exclusive filters. */
export function Segmented<V extends string>({
  value,
  options,
  onChange,
}: SegmentedProps<V>) {
  const { c, r, s, type } = useUi();
  const index = Math.max(
    0,
    options.findIndex(o => o.value === value),
  );
  // The white "selected" pill slides under the labels to the chosen one.
  const [width, setWidth] = useState(0);
  const segmentWidth = width / options.length;
  const pos = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    const a = isReduceMotion()
      ? Animated.timing(pos, {
          toValue: index,
          duration: 0,
          useNativeDriver: true,
        })
      : Animated.spring(pos, {
          toValue: index,
          speed: 18,
          bounciness: 4,
          useNativeDriver: true,
        });
    a.start();
    return () => a.stop();
  }, [index, pos]);
  return (
    <View
      onLayout={e => setWidth(e.nativeEvent.layout.width - SEGMENTED_PAD * 2)}
      style={[
        styles.segmented,
        {
          backgroundColor: c.surfaceAlt,
          borderRadius: r.md,
          marginHorizontal: s.lg,
          marginVertical: s.md,
        },
      ]}
      accessibilityRole="tablist"
    >
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segmentPill,
            {
              width: segmentWidth,
              borderRadius: r.sm + 2,
              backgroundColor: c.surface,
              borderColor: c.border,
              transform: [
                {
                  translateX: pos.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, segmentWidth],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      {options.map(o => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.count ? `${o.label}, ${o.count}` : o.label}
            testID={`segment-${o.value}`}
            style={[
              styles.segment,
              { borderRadius: r.sm + 2 },
              // Before the first layout there is no pill: draw it here.
              active && !width
                ? { backgroundColor: c.surface, borderColor: c.border }
                : null,
            ]}
          >
            <Text
              style={[type.label, { color: active ? c.text : c.textMuted }]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
            {o.count ? (
              <View
                style={[
                  styles.segmentCount,
                  {
                    backgroundColor: toneColors(c, o.countTone ?? 'accent').fg,
                    borderRadius: r.pill,
                    marginLeft: s.xs + 2,
                  },
                ]}
                testID={`segment-${o.value}-count`}
              >
                <Text style={[type.caption, { color: c.surface }]}>
                  {o.count > 99 ? '99+' : o.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Quantities without trailing zeros: 3, 2.5, 0.125. */
export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  badge: { paddingVertical: 2, alignSelf: 'flex-start' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    flex: 1,
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCount: {
    position: 'absolute',
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Full tile width: a label shrink-wrapped to its measured width can wrap
  // when Android draws it, and the second line is cut off ("Count inventory").
  tileLabel: { alignSelf: 'stretch', textAlign: 'center' },
  tileRow: { flexDirection: 'row' },
  tileCell: { flex: 1, flexDirection: 'row' },
  stat: {
    flex: 1,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabular: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start' },
  detailIcon: { marginTop: 1 },
  half: { width: '50%' },
  full: { width: '100%' },
  segmentTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  segmentBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  cardSegment: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  rowLine: { marginTop: 2 },
  progress: { height: 4, overflow: 'hidden' },
  split: { height: 8, flexDirection: 'row', gap: 2, overflow: 'hidden' },
  overviewHead: { flexDirection: 'row', alignItems: 'center' },
  overviewIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8 },
  overviewStatus: { flexDirection: 'row', alignItems: 'center' },
  progressFill: { height: '100%' },
  stepValue: {
    minWidth: 72,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  segmented: { flexDirection: 'row', padding: SEGMENTED_PAD },
  segment: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segmentCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentPill: {
    position: 'absolute',
    top: SEGMENTED_PAD,
    bottom: SEGMENTED_PAD,
    left: SEGMENTED_PAD,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: ICON_BUTTON,
    height: ICON_BUTTON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  rowIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButton: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
