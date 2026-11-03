import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LogoSpinner from '../components/LogoSpinner';
import Icon, { IconName } from './Icon';
import { Button } from './primitives';
import { Tone, toneColors, useUi } from './theme';

type Props =
  | { kind: 'loading'; title?: string }
  | {
      kind: 'empty' | 'error' | 'offline';
      /** Instead of the kind's own icon (e.g. a search hint). */
      icon?: IconName;
      title: string;
      body?: string;
      actionLabel?: string;
      onAction?: () => void;
      secondaryLabel?: string;
      onSecondary?: () => void;
    };

const LOOK: Record<
  'empty' | 'error' | 'offline',
  { icon: IconName; tone: Tone }
> = {
  empty: { icon: 'inbox', tone: 'neutral' },
  error: { icon: 'error', tone: 'danger' },
  offline: { icon: 'offline', tone: 'warning' },
};

/** Full-area loading, empty, error and offline states. */
function StateView(props: Props) {
  const { c, s, r, type } = useUi();
  if (props.kind === 'loading') {
    return (
      <View style={styles.center} testID="state-loading">
        <LogoSpinner size={56} />
        {props.title ? (
          <Text style={[type.body, { color: c.textMuted, marginTop: s.lg }]}>
            {props.title}
          </Text>
        ) : null}
      </View>
    );
  }
  const look = LOOK[props.kind];
  const tone = toneColors(c, look.tone);
  return (
    <View
      style={[styles.center, { padding: s.xl }]}
      testID={`state-${props.kind}`}
    >
      <View
        style={[
          styles.badge,
          {
            borderRadius: r.pill,
            backgroundColor: tone.bg,
            marginBottom: s.lg,
          },
        ]}
      >
        <Icon name={props.icon ?? look.icon} color={tone.fg} size={28} />
      </View>
      <Text style={[type.heading, styles.text, { color: c.text }]}>
        {props.title}
      </Text>
      {props.body ? (
        <Text
          style={[
            type.body,
            styles.text,
            { color: c.textMuted, marginTop: s.sm },
          ]}
        >
          {props.body}
        </Text>
      ) : null}
      {props.actionLabel && props.onAction ? (
        <Button
          label={props.actionLabel}
          onPress={props.onAction}
          variant="secondary"
          size="md"
          icon={props.kind === 'empty' ? undefined : 'refresh'}
          style={[styles.action, { marginTop: s.xl }]}
          testID="state-action"
        />
      ) : null}
      {props.secondaryLabel && props.onSecondary ? (
        <Button
          label={props.secondaryLabel}
          onPress={props.onSecondary}
          variant="ghost"
          size="md"
          style={{ marginTop: s.sm }}
          testID="state-secondary"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: { minWidth: 180 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center' },
});

export default StateView;
